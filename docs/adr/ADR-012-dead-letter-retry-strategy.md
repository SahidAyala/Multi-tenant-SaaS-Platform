# ADR-012 — Dead-Letter and Retry Strategy

**Status:** Accepted  
**Date:** 2026-05-20  
**Deciders:** Platform team

---

## Context

The platform has three distinct failure surfaces:

1. **Outbox forwarding failures** (NestJS) — `OutboxProcessorService` calls Event
   Streaming's ingest API and may fail due to network errors or service downtime.
2. **Event Streaming Kafka consumer failures** (Go) — the ES consumer tries to index
   events into Elasticsearch; a failure here means the read model is stale.
3. **Workflow Engine Kafka consumer failures** (Go) — the WE consumer calls
   `EventTriggerService.Handle()` which may fail due to DB errors or transient issues.

Each failure surface previously had different (or no) retry behaviour. Silent failure
(events disappearing without trace) was the risk in each case.

---

## Decision

### Surface 1 — Outbox forwarding (NestJS)

**Strategy:** In-process retry with exponential backoff, then mark `failed` after
`MAX_ATTEMPTS = 5`. Failed entries remain in `outbox_entries` for manual inspection.

**Operational runbook:**
- `failed` outbox entries do NOT disappear — they accumulate in `outbox_entries`
- Query: `SELECT * FROM outbox_entries WHERE status = 'failed' ORDER BY created_at ASC`
- Resolution: fix the underlying cause (Event Streaming down, auth expired), then reset:
  `UPDATE outbox_entries SET status = 'pending', attempts = 0 WHERE status = 'failed'`
- Alerting: add a Prometheus counter `outbox_entries_failed_total`. Alert if count > 0
  for more than 15 minutes (indicates a systemic forwarding failure).

**Why `failed` rather than DLQ topic:**
The event is already durable in NestJS's own PostgreSQL. A Kafka DLQ topic would be a
second copy. The `outbox_entries` table IS the DLQ — it has the full event payload,
error message, and timestamp. Resetting to `pending` re-drives the retry.

### Surface 2 — Event Streaming Kafka consumer (Go, Elasticsearch indexer)

**Strategy:** Existing DLQ via `DLQPublisher` (implemented in `kafka/dlq_producer.go`).
The `consume.Service` handles indexing failures by:
1. Writing to the Kafka DLQ topic (`KAFKA_DLQ_TOPIC`)
2. Committing the offset (so the main consumer does not stall)
3. The event remains in PostgreSQL — the read model can be rebuilt via the replay engine

**Operational runbook:**
- DLQ topic: configured via `KAFKA_DLQ_TOPIC` env var
- Reprocessing: replay events from PostgreSQL via the `replay` service once the indexer
  issue is fixed
- Alerting: monitor consumer lag on the DLQ topic; non-zero lag means events are
  accumulating there

### Surface 3 — Workflow Engine Kafka consumer (Go, trigger handler)

**Strategy:** In-memory retry loop (up to `maxHandlerRetries = 3` attempts), then
dead-letter by committing the offset.

```
Message received
  → handler attempt 1
  → handler attempt 2 (if attempt 1 failed)
  → handler attempt 3 (if attempt 2 failed)
  → if all fail: log ERROR("message dead-lettered"), commit offset
```

**Why commit after max retries (instead of infinite retry):**
Infinite retry without a maximum would stall the partition indefinitely. All later
messages in the same partition (likely from different tenants, different events) would
back up. The cost of committing a failed message is bounded: the source event is
durable in Event Streaming's PostgreSQL and can be re-triggered manually.

**Recovery path for dead-lettered workflow triggers:**
1. The "kafka consumer: message dead-lettered" log line includes `event_id`, `tenant_id`,
   and `correlation_id`
2. An operator can manually trigger the workflow: `POST /workflows/:id/runs`
3. Once Event Streaming's replay engine is built, automated re-triggering is possible

**Alerting:** the log message `"kafka consumer: message dead-lettered after max retries"` at
`ERROR` level must be routed to the on-call alerting system. This is a sentinel event
requiring human action.

---

## Retry Metadata

All retry-related information is preserved for operational visibility:

| Surface | Retry count location | Error location |
|---------|---------------------|----------------|
| Outbox | `outbox_entries.attempts` | `outbox_entries.last_error` |
| ES consumer | DLQ message `reason` field | DLQ message |
| WE consumer | Structured log `attempt`/`max_attempts` fields | Structured log `error` field |

---

## Failure Observability Requirements

The following log signatures MUST be routed to alerting:

| System | Log message | Severity | Action |
|--------|-------------|----------|--------|
| NestJS | `OutboxProcessor: forward failed` with `attempts >= MAX_ATTEMPTS` | WARN | Check outbox_entries.status = 'failed' |
| Event Streaming | `"failed to publish to DLQ"` | ERROR | Both indexer AND DLQ are down |
| Workflow Engine | `"message dead-lettered after max retries"` | ERROR | Manual workflow re-trigger required |

---

## Consequences

### Positive

- Failed events never disappear silently — they are always in an auditable location
  (outbox_entries table, DLQ topic, or ERROR-level structured log)
- Partition stall is bounded to `maxHandlerRetries` attempts per message
- Recovery is possible for all three surfaces without code changes

### Negative

- `outbox_entries` table must be monitored for `failed` rows (no automated alert today)
- Workflow Engine dead-lettering requires manual re-trigger (no automated replay yet)
- The Event Streaming DLQ topic requires a consumer to process and alert on it

### Neutral

- These are explicit "at-least-once, at-most-best-effort" guarantees — not exactly-once
- The replay engine (marked as missing in the Event Streaming CLAUDE.md) is the long-term
  solution for automated recovery across all three surfaces

---

## Related ADRs

- ADR-008: Outbox pattern for durable event forwarding
- ADR-009: Event-driven workflow triggers
- ADR-011: Idempotency strategy
