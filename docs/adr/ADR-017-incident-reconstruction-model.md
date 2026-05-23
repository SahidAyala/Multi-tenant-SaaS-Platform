# ADR-017 — Incident Reconstruction Model

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** Platform team

---

## Context

When something goes wrong in production — a workflow did not run, an event was
lost, a tenant's data is in an inconsistent state — an operator needs to answer:

1. **What happened?** Which events were emitted? In what order?
2. **Why?** Which event caused which downstream effect?
3. **Where did it stop?** Which step in the chain failed?
4. **How do I fix it?** Which replay or re-trigger restores the system?

Without a deliberate incident reconstruction model, answering these questions
requires knowing which service to query, which database table to check, and how
to join log lines from three different services.

This ADR establishes a structured approach to incident reconstruction using the
tools already in place: `correlationId`, `causationId`, `traceId`, structured
logs, and the Event Streaming query APIs.

---

## Decision

### The reconstruction primitives

Three primitives allow reconstructing any incident:

| Primitive | Starting point | What it reveals |
|-----------|---------------|-----------------|
| **Correlation journal** | A `correlationId` | Every event in Event Streaming sharing this ID; ordered by `occurred_at`. Covers the entire lifecycle of one user request or scheduled job. |
| **Causation tree** | An `eventId` | All events whose `causationId` = this eventId. Walk the tree recursively to find all downstream effects. |
| **Tenant timeline** | A `tenantId` + time range | All events for a tenant in a time window. Good when the correlationId is unknown (e.g. "something went wrong for tenant X yesterday"). |

These primitives are exposed via Event Streaming query APIs:

```
# Correlation journal — all events for a request chain:
GET /events?correlation_id={cid}&limit=100

# Causation tree — events caused by a specific event:
GET /events/{eventId}/causes

# Tenant timeline — all events for a tenant in a time range:
GET /events/timeline?tenant_id={tid}&from={iso8601}&to={iso8601}&limit=100
```

All three return events from PostgreSQL (strongly consistent) with all canonical
envelope fields including `correlationId`, `causationId`, `traceId`, `actorId`,
`isReplay`.

### The reconstruction workflow

**Step 1 — Start from what you know.**

| You know | Start here |
|----------|-----------|
| Error report from user + approximate time | Tenant timeline for that time window |
| HTTP request ID from access logs | `X-Correlation-ID` response header → correlation journal |
| A log line with `event_id` | Getvent by ID, then causation tree |
| A log line with `correlation_id` | Correlation journal |
| Workflow Engine ERROR log with `event_id` | Get event → correlation journal |

**Step 2 — Reconstruct the correlation journal.**

```bash
CORRELATION_ID="abc-xyz"

curl "https://event-streaming/events?correlation_id=$CORRELATION_ID" \
  -H "Authorization: Bearer $TOKEN" | \
  jq '.events | sort_by(.occurred_at) | .[] | {
    id, type, source, occurred_at, actor_id, causation_id,
    is_replay, replay_source_event_id
  }'
```

Expected output for a "create organization" request that triggered a workflow:
```json
[
  {"id": "ev-001", "type": "tenant.created",        "source": "atlas-saas-platform", ...},
  {"id": "ev-002", "type": "workflow.run.started",   "source": "workflow-engine",     "causation_id": "ev-001"},
  {"id": "ev-003", "type": "workflow.step.started",  "source": "workflow-engine",     "causation_id": "ev-001"},
  {"id": "ev-004", "type": "workflow.step.succeeded","source": "workflow-engine",     "causation_id": "ev-001"},
  {"id": "ev-005", "type": "workflow.run.completed", "source": "workflow-engine",     "causation_id": "ev-001"}
]
```

If `ev-002` through `ev-005` are missing, the workflow was never triggered.
If `ev-003` is present but `ev-004` is not, the step is still running or failed.

**Step 3 — Follow the causation tree.**

For a specific event, find all events it caused (direct children in the causation
tree):

```bash
EVENT_ID="ev-001"

curl "https://event-streaming/events/$EVENT_ID/causes" \
  -H "Authorization: Bearer $TOKEN" | \
  jq '.events[] | {id, type, source, occurred_at}'
```

Recurse by calling `/events/{child_id}/causes` for each child.

**Step 4 — Cross-reference Workflow Engine state.**

The Workflow Engine logs structured output for every run. Find the workflow run
triggered by a specific event:

```bash
# The workflow run ID is in the Event Streaming event's payload or metadata:
PAYLOAD=$(curl "https://event-streaming/events?correlation_id=$CORRELATION_ID" \
  -H "Authorization: Bearer $TOKEN" | \
  jq -r '.events[] | select(.type == "workflow.run.started") | .payload | @base64d')

echo "$PAYLOAD" | jq .run_id   # → wf-run-uuid

# Cross-reference in Workflow Engine:
curl "https://workflow-engine/workflows/$WORKFLOW_ID/runs/$RUN_ID" \
  -H "Authorization: Bearer $WF_TOKEN"
```

**Step 5 — Check for dead-lettered messages.**

If the correlation journal shows events published but no `workflow.run.started`:
```bash
# Search Workflow Engine logs for this event_id:
grep '"event_id":"ev-001"' /var/log/workflow-engine.log | jq '{level, message}'

# Dead-lettered events show:
# {"level":"ERROR","message":"kafka consumer: message dead-lettered after max retries","event_id":"ev-001",...}
```

**Step 6 — Check for replays.**

The correlation journal may contain replay events (`is_replay: true`). To
distinguish original events from replays:

```bash
curl "https://event-streaming/events?correlation_id=$CORRELATION_ID" \
  -H "Authorization: Bearer $TOKEN" | \
  jq '.events[] | select(.metadata.is_replay == "true") | {id, replay_source_event_id, metadata}'
```

### The "debuggable event" contract

Every emitted event MUST carry enough metadata to reconstruct what happened from
that event alone, without querying other services. The following fields are
mandatory for every event crossing a service boundary:

| Field | Why needed |
|-------|-----------|
| `eventId` | Unique identity; lookup by ID; causation tree roots |
| `eventType` | Human-readable; filter by type in reconstruction |
| `correlationId` | Entry point for correlation journal |
| `causationId` | Parent in the causation tree |
| `tenantId` | Scope for tenant timeline |
| `actorId` | Who triggered it — "system", user UUID, or service name |
| `sourceService` | Which service emitted it |
| `occurredAt` | Ordering in the timeline |
| `traceId` | Link to APM trace (when OTel is active) |

Optional fields that significantly improve debuggability:
- `sourceVersion` — which service version was deployed when this happened
- `isReplay` — was this a recovery replay or an original event?
- `replayReason` — why was this event replayed?

### Cross-system log correlation

All three services emit structured JSON logs. An incident reconstruction from
logs alone requires that every log line can be joined to the event journal. The
minimum log fields when processing an event:

```json
{
  "level": "INFO",
  "message": "workflow run created from event trigger",
  "correlation_id": "abc-xyz",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "tenant_id": "acme-corp",
  "event_id": "ev-001",
  "event_type": "tenant.created",
  "run_id": "wf-run-uuid"
}
```

A log query `grep '"correlation_id":"abc-xyz"'` across all three services'
JSON logs should return every log line related to that request, ordered by
timestamp.

### Incident resolution checklist

When an operator opens an incident for "event not processed" or "workflow not
run":

```
□ 1. Obtain the correlationId (from access logs, error report, or tenant timeline)
□ 2. Run correlation journal query → identify which events were emitted
□ 3. Identify the last event in the expected chain (e.g. workflow.run.completed)
□ 4. If missing: check causation tree for ev-001 → was it produced at all?
□ 5. If ev-001 present but workflow events missing:
     □ Search Workflow Engine logs for event_id → dead-lettered?
     □ Check outbox_entries for the originating tenant → any status='failed'?
□ 6. If root cause found and fixed:
     □ Surface 1 (outbox): SQL reset, wait for next poll
     □ Surface 2 (ES consumer): replay from PostgreSQL
     □ Surface 3 (WE consumer): POST /replay with eventIds filter
□ 7. Verify resolution: re-run correlation journal → all expected events present
□ 8. Write post-mortem with correlationId and timeline as evidence
```

---

## Consequences

### Positive

- A single `correlationId` reconstructs the full lifecycle across three services
  and their log streams
- No custom tooling required — standard `curl` and `jq` are sufficient
- The checklist gives operators a deterministic procedure, reducing incident MTTR

### Negative

- Correlation journal is only as complete as the `correlationId` propagation;
  legacy events or events from services that don't propagate the ID correctly
  will be missing
- Cross-service log correlation requires log aggregation (e.g. Loki, CloudWatch)
  to be configured; this ADR assumes logs are aggregated but doesn't mandate a
  specific tool

### Neutral

- This model is a procedure, not a UI. A future observability dashboard built on
  these APIs would give the same power with better ergonomics

---

## Related ADRs

- ADR-010: Canonical event envelope (defines the fields used in reconstruction)
- ADR-014: Distributed tracing strategy (traceId and traceparent propagation)
- ADR-015: Replay architecture (recovery step in the checklist)
- ADR-016: Dead-letter recovery strategy (surface-specific recovery procedures)
