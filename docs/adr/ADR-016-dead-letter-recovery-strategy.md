# ADR-016 — Dead-Letter Recovery Strategy

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** Platform team

---

## Context

ADR-012 documented the dead-letter strategy for each failure surface (how events
end up dead-lettered and where they are stored). This ADR documents the **recovery
procedures** — how an operator finds dead-lettered events and gets them processed.

Three failure surfaces exist:
1. **NestJS outbox** — entries with `status = 'failed'` in `outbox_entries`
2. **Event Streaming Kafka consumer** — events on `KAFKA_DLQ_TOPIC`
3. **Workflow Engine Kafka consumer** — events logged at ERROR with
   `"kafka consumer: message dead-lettered after max retries"`

---

## Decision

### Surface 1 — NestJS outbox recovery

**Discovery:** Query the `outbox_entries` table:
```sql
SELECT outbox_entry_id, event_id, event_type, tenant_id,
       attempts, last_error, created_at, occurred_at
FROM outbox_entries
WHERE status = 'failed'
ORDER BY created_at ASC;
```

**Recovery:** After fixing the root cause (Event Streaming downtime, auth token
expiry, network partition), reset the entries to `pending`:
```sql
-- Reset all failed outbox entries (requires manual review first):
UPDATE outbox_entries
SET status = 'pending', attempts = 0, last_error = NULL
WHERE status = 'failed';

-- Reset a specific tenant's entries:
UPDATE outbox_entries
SET status = 'pending', attempts = 0, last_error = NULL
WHERE status = 'failed' AND tenant_id = '<tenant_id>';

-- Reset a specific event (safest):
UPDATE outbox_entries
SET status = 'pending', attempts = 0, last_error = NULL
WHERE event_id = '<event_id>';
```

The `OutboxProcessorService` polls every 5 seconds. Reset entries will be
re-forwarded on the next poll cycle.

**Alerting:** A Prometheus counter `outbox_entries_failed_total` must alert if
`status = 'failed'` count > 0 for more than 15 minutes. Query:
```
SELECT COUNT(*) FROM outbox_entries WHERE status = 'failed';
```

---

### Surface 2 — Event Streaming Elasticsearch indexer recovery

**Discovery:** Monitor consumer lag on `KAFKA_DLQ_TOPIC`. Non-zero lag indicates
events accumulating there.

**Recovery option A (preferred):** Fix the Elasticsearch issue and trigger a
replay from PostgreSQL (the source of truth) via the replay API:
```bash
# Get events that failed to index (by time range or correlation ID):
curl -X POST https://event-streaming/replay \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "filter": {
      "tenantId": "<tenant>",
      "fromTime": "<failure_window_start>",
      "toTime": "<failure_window_end>"
    },
    "options": {
      "dryRun": true,
      "replayReason": "ES indexer recovery after downtime"
    }
  }'

# Verify the dry-run result, then execute:
# (remove dryRun or set to false)
```

**Recovery option B:** Process the DLQ topic directly. The DLQ message contains
the original event payload and a `reason` field with the error. Re-publish to
the main topic after fixing the root cause.

**Why option A is preferred:** The event is already in PostgreSQL. Re-ingesting
from the store means the replay event flows through the full pipeline (store →
Kafka → indexer) in a clean state. Processing the DLQ manually risks applying the
same faulty indexer code to the message.

---

### Surface 3 — Workflow Engine consumer recovery

**Discovery:** Monitor for `ERROR` log lines containing
`"kafka consumer: message dead-lettered after max retries"`. Extract:
- `event_id` — the Event Streaming event UUID
- `tenant_id` — the tenant
- `correlation_id` — the originating request
- `event_type` — what type of event was dead-lettered

**Recovery step 1 — Understand the cause:**
```bash
# Find all log lines for this event:
grep '"event_id":"<event_id>"' /var/log/workflow-engine.log | jq .

# Find the original event in Event Streaming:
curl -s https://event-streaming/events/<event_id> \
  -H "Authorization: Bearer $TOKEN" | jq .
```

**Recovery step 2 — Fix the root cause.** The dead-letter was caused by persistent
handler failure (DB error, bug, missing record). Fix before re-triggering.

**Recovery step 3A — Manual workflow re-trigger:**
If the workflow run exists but is in wrong state, trigger manually:
```bash
curl -X POST https://workflow-engine/workflows/<workflow_id>/runs \
  -H "Authorization: Bearer $WF_TOKEN"
```

**Recovery step 3B — Replay via Event Streaming:**
Re-publish the dead-lettered event from Event Streaming so the Workflow Engine
Kafka consumer picks it up again (after deploying the fix):
```bash
curl -X POST https://event-streaming/replay \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "filter": {
      "eventIds": ["<event_id>"]
    },
    "options": {
      "dryRun": false,
      "replayReason": "WE consumer dead-lettered; <jira-ticket>"
    }
  }'
```

The replayed event has a new UUID (`replaySourceEventId` = original). The Workflow
Engine consumer treats it as a new event. The `processed_integration_events`
idempotency guard does NOT block it (new UUID). The workflow run created from the
replayed event is a new run.

**Recovery step 3C — Automated re-trigger (future):**
Once the Event Streaming replay engine is connected to a Workflow Engine endpoint,
an operator can configure auto-recovery: dead-lettered events are automatically
replayed after N minutes. This requires implementing a replay subscription in
Workflow Engine.

---

### Observability requirements

Dead-letter events from all three surfaces MUST produce metrics:

| Metric | System | Alert condition |
|--------|--------|-----------------|
| `outbox_failed_total` | NestJS | > 0 for 15 minutes |
| `dlq_messages_total` | Event Streaming | Any message on DLQ topic |
| `wf_dead_lettered_total` | Workflow Engine | > 0 in 5 minutes |

All three should page on-call immediately. Dead-lettered events represent
**data loss risk** if not recovered.

### Debugging aids

**Find all events for a correlation ID (cross-surface reconstruction):**
```bash
# All events in Event Streaming for this correlation:
curl "https://event-streaming/events?correlation_id=<cid>" \
  -H "Authorization: Bearer $TOKEN" | jq '.events[] | {id, type, occurred_at, is_replay}'

# Check if a workflow was triggered:
grep '"correlation_id":"<cid>"' /var/log/workflow-engine.log | jq '{level, message, event_type, run_id}'
```

**Find all replays of a specific event:**
```bash
# Events whose replay_source_event_id points to the original:
curl "https://event-streaming/events?correlation_id=<cid>&is_replay=true" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Consequences

### Positive

- All three failure surfaces have explicit, documented recovery procedures
- The replay API (ADR-015) provides a unified recovery tool for surfaces 2 and 3
- Recovery does not require code changes — SQL reset (surface 1) or API call (2, 3)

### Negative

- Surface 3 recovery creates a new workflow run (replay event has new UUID);
  if the original run is in a broken state, the orphaned run must be manually
  cancelled
- Large-scale recovery (many dead-lettered events) requires scripting multiple
  replay calls due to the 1000 event limit

### Neutral

- This ADR extends ADR-012 (which documented where events go when they fail);
  ADR-012 describes the failure path, ADR-016 describes the recovery path

---

## Related ADRs

- ADR-012: Dead-letter and retry strategy (failure path)
- ADR-015: Replay architecture (recovery tool)
- ADR-011: Idempotency strategy (replay idempotency behaviour)
- ADR-017: Incident reconstruction model (investigation before recovery)
