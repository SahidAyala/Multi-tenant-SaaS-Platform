# ADR-015 — Replay Architecture

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** Platform team

---

## Context

The platform has accumulating operational needs that require re-processing events:

1. A Workflow Engine consumer dead-lettered a message; the workflow never ran.
2. An Elasticsearch indexer failure left the read model stale for a tenant.
3. A bug in a consumer caused incorrect side-effects; events need to be replayed
   after deploying a fix.
4. An operator wants to inspect "what would happen if these events ran again"
   without actually committing to it (dry-run debugging).

The existing `replay` service (`internal/application/replay/service.go`) only
supports reading events back from a stream by version — it does not re-publish
them to Kafka, does not support flexible filters, and has no safety controls.

---

## Decision

### Core principle: replay creates new events

Replaying an event **never modifies the original**. Event Streaming's event store
is append-only and immutable by design (ADR-007). Instead, replay appends new
events that carry the original payload plus replay metadata:

```
Original event (immutable):
  id: abc-123
  type: tenant.created
  occurred_at: 2026-05-01T10:00:00Z
  payload: { ... }
  is_replay: false

Replayed event (new row):
  id: def-456          ← fresh UUID
  type: tenant.created ← same type
  occurred_at: 2026-05-21T09:30:00Z  ← when replay ran
  payload: { ... }     ← identical payload
  is_replay: true
  replay_id: "replay-batch-789"
  replay_reason: "workflow consumer dead-lettered; manual recovery"
  replay_source_event_id: "abc-123"  ← points to original
  correlation_id: "abc-xyz"  ← preserved from original
  causation_id: "..."         ← preserved from original
```

This design means:
- Original events remain in their streams, unmodified
- Replayed events flow through Kafka to consumers, which process them normally
- Consumers that want to skip replays can filter on `is_replay: true`
- The full causation chain is preserved (same `correlationId`, same `causationId`)

### Replay filters

A replay request accepts a `ReplayFilter` specifying which events to replay:

| Filter | Description |
|--------|-------------|
| `tenantId` | Replay all events for a tenant (required unless `eventIds` given) |
| `streamId` | Narrow to a specific stream within the tenant |
| `correlationId` | Replay all events sharing a correlation ID |
| `eventType` | Replay a specific event type (e.g. "tenant.created") |
| `fromTime` | Events with `occurred_at >= fromTime` (ISO-8601) |
| `toTime` | Events with `occurred_at <= toTime` (ISO-8601) |
| `eventIds` | Replay specific events by UUID (overrides other filters) |

At least one of `tenantId` or `eventIds` is required.

### Replay options

| Option | Default | Description |
|--------|---------|-------------|
| `dryRun` | false | Preview matched events without publishing to Kafka |
| `replayReason` | required | Human-readable reason for replay (stored on each replayed event) |
| `maxEvents` | 1000 | Hard safety limit; request fails if filter matches more |

### Replay API

```
POST /replay
{
  "filter": {
    "tenantId": "acme-corp",
    "correlationId": "abc-xyz",
    "fromTime": "2026-05-01T00:00:00Z",
    "toTime": "2026-05-02T00:00:00Z"
  },
  "options": {
    "dryRun": false,
    "replayReason": "workflow consumer dead-lettered; manual recovery"
  }
}

Response (non-dry-run):
{
  "replayId": "replay-789",
  "dryRun": false,
  "matchedCount": 3,
  "replayedCount": 3,
  "events": [...]   ← the newly created replay events
}

Response (dry-run):
{
  "replayId": "",
  "dryRun": true,
  "matchedCount": 3,
  "replayedCount": 0,
  "events": [...]   ← the original events that WOULD be replayed
}
```

### Replay safety constraints

1. **Max events per batch**: 1000. If the filter matches more, the API returns
   HTTP 422 with `{"error": "filter matched N events; replay limit is 1000 — narrow the filter"}`.
   Operators must narrow by time range or use multiple smaller calls.

2. **Dry-run first**: Operators SHOULD always do a dry-run call first to inspect
   what would be replayed before committing to an active replay.

3. **`replayReason` is required**: An empty reason is rejected. Reasons are stored
   permanently on each replayed event and are the primary audit trail for replays.

4. **Consumer idempotency**: Replayed events are new events with new UUIDs, so
   the Workflow Engine's `processed_integration_events` guard does NOT block them
   (the new event UUID was never seen before). This is intentional — the point of
   replay is to re-trigger processing. Consumers that must skip replays should
   check `is_replay: true` in the event metadata.

5. **Replay of replays**: A replayed event that is itself a replay (`is_replay: true`)
   can be replayed again. Each replay creates a new event with its own `replayId`.
   The `replaySourceEventId` always points to the immediately preceding event (not
   necessarily the original original). Follow the chain via `replaySourceEventId`
   to reach the root.

### Replay metadata propagation

When a replayed event flows through Kafka to the Workflow Engine:
- `Metadata["is_replay"]` = "true"
- `Metadata["replay_id"]` = the batch ID
- `Metadata["replay_source_event_id"]` = original event UUID

The `IntegrationEvent.Metadata` map carries these so consumers can inspect them
without schema changes.

### Dry-run vs active replay

Both paths query the same `QueryForReplay` store method. The difference:
- **Dry-run**: returns the original matched events directly; no new rows written;
  no Kafka publish
- **Active**: creates new replay events via `Ingest()` for each matched event;
  returns the newly created events

### Read-only replay (for debugging, not recovery)

`GET /streams/{streamID}/events?from_version=N` already provides read-only
stream access. For correlation-based debugging, `GET /events?correlation_id=X`
returns all events in a correlation scope directly from PostgreSQL.

These read-only queries do NOT create new events and do NOT re-publish to Kafka.
Use them for debugging. Use `POST /replay` only when you need consumers to
re-process events.

---

## Consequences

### Positive

- Original events remain immutable; replay history is explicit and auditable
- Dry-run prevents accidental double-processing
- `replayReason` provides permanent audit trail for every replay
- Replay events flow through the normal Kafka pipeline; no special consumer code
- `replaySourceEventId` enables "who triggered this replay?" queries

### Negative

- Replayed events increment stream versions — streams grow when events are replayed
- Consumers MUST check `is_replay` if they have non-idempotent side effects that
  should not re-run on replay (e.g. sending emails). This is the consumer's
  responsibility and requires explicit code.
- The 1000 event limit may be frustrating for large-scale recovery jobs;
  operators must script multiple calls

### Neutral

- The existing `Replay()` service (reads events, validates contiguity, returns them)
  is preserved for the internal read-only use case. The new `POST /replay` endpoint
  uses a separate `ReplayService` that handles re-ingestion.

---

## Related ADRs

- ADR-007: Event Streaming as canonical backbone (immutable store — replay preserves this)
- ADR-011: Idempotency strategy (consumer idempotency and replay interaction)
- ADR-012: Dead-letter and retry strategy (replay is the recovery path for dead-lettered events)
- ADR-016: Dead-letter recovery strategy (operational procedure using replay)
- ADR-017: Incident reconstruction (replay as a recovery tool in the runbook)
