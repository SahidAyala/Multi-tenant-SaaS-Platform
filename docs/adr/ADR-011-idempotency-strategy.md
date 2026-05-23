# ADR-011 — Idempotency Strategy

**Status:** Accepted  
**Date:** 2026-05-20  
**Deciders:** Platform team

---

## Context

The Atlas platform uses at-least-once delivery semantics throughout:

- The outbox processor retries forwarding until the Event Streaming HTTP call succeeds,
  meaning the same event can arrive at Event Streaming multiple times if the outbox is
  retried after a previously-successful (but unconfirmed) forward.
- Kafka provides at-least-once delivery; a message can be redelivered if the consumer
  crashes between processing and committing its offset.

Without explicit idempotency guards, these scenarios cause:
1. **Duplicate events in Event Streaming** — two rows for the same logical event
2. **Duplicate workflow runs** — two runs triggered by the same integration event

---

## Decision

Three explicit idempotency layers are introduced, one per delivery hop:

### Layer 1 — Outbox deduplication (NestJS → outbox_entries)

`OutboxEntryOrmEntity` has `@Unique('uq_outbox_entries_event_id', ['eventId'])`.

This prevents the `ForwardingEventBus` from inserting two outbox rows for the same
`eventId`. If the same `TenantAwareEvent` is published twice (e.g. a retry in a command
handler), the second `outboxRepo.append()` fails with a DB unique constraint violation.
The `ForwardingEventBus` catches this error and logs a warning — it does not re-raise,
because the event is already queued for forwarding.

**Guarantee:** each platform event appears at most once in `outbox_entries`.

**Limitation:** if the domain mutation is retried but `eventId` changes (i.e. a new
UUID is generated), a second outbox row is created. Command handlers must not generate
a new `eventId` on retry — they should use a deterministic ID derived from the command's
idempotency key when available.

### Layer 2 — Event Streaming idempotent ingest (outbox → Postgres `events` table)

`EventStore.Append()` uses `ON CONFLICT (id) DO UPDATE SET id = EXCLUDED.id RETURNING version`.

If the outbox processor retries a previously-successful forward (e.g. the HTTP call
succeeded but the response was lost in transit), Event Streaming receives the same
event UUID a second time. The `ON CONFLICT` clause returns the existing row's version
without inserting a duplicate.

**Guarantee:** a given event UUID appears at most once in `events` regardless of how
many times it is forwarded.

**Limitation:** this relies on the NestJS `TenantAwareEvent.eventId` mapping to the
`event.ID` UUID in Event Streaming. The outbox processor sends `event_id` in the
request metadata; Event Streaming's ingest service currently assigns a fresh UUID.
A future improvement: parse `event_id` from the forwarded metadata and use it as the
PostgreSQL row UUID, making the guard fully end-to-end. This is deferred because it
requires changing the Event Streaming ingest API to accept a caller-supplied ID.

### Layer 3 — Workflow Engine trigger deduplication (Kafka → workflow_runs)

`processed_integration_events` table with `PRIMARY KEY (source_event_id, project_id)`.

Before creating a `workflow_run`, `EventTriggerService` calls
`ProcessedEventRepository.RecordIfNew()` using an `INSERT ... ON CONFLICT DO NOTHING`.
If `0` rows are affected, the event was already processed for this project and the
handler returns `nil` without creating a new run.

**Guarantee:** for each `(source_event_id, project_id)` pair, at most one workflow run
is created regardless of how many times Kafka delivers the message.

**Limitation:** there is a small TOCTOU race: two concurrent consumer instances could
both pass the `FindByExternalTenantAndEventType` check, both call `CreateWorkflowRunWithStepRuns`,
and then one of the `RecordIfNew` calls fails with `ErrAlreadyProcessed`. The "loser"
run is left in `pending` state and is never executed (the executor will pick it up only
if a step run exists for it, which it does — it will execute once, find no more steps,
and mark it succeeded with 0 steps). A future improvement is to wrap the
trigger+record in a single SQL transaction. For now this is acceptable at current scale.

---

## Consequences

### Positive

- No silent duplicate events in Event Streaming under the expected failure modes
- No duplicate workflow runs under normal retry scenarios
- All three guards are explicit and auditable (`grep ErrAlreadyProcessed`, `grep ON CONFLICT`)
- No shared global locks — each guard is local to its own data store

### Negative

- Layer 2 guard (Event Streaming) is partial — event ID is not yet threaded end-to-end
  from NestJS through to Event Streaming's `events.id` column
- Layer 3 has a narrow TOCTOU race under concurrent consumers (acceptable for now)
- `processed_integration_events` grows unboundedly; a maintenance job should purge rows
  older than Kafka's retention window (at which point redelivery can no longer occur)

### Neutral

- We do NOT claim exactly-once delivery. The guarantees above prevent most practical
  duplicates but are not formally "exactly-once" end-to-end.

---

## Alternatives Considered

### Optimistic locking with version check

Rejected: requires the producer to supply the expected version. Adds coordination burden
to the outbox processor and is not compatible with the existing ingest API shape.

### Idempotency keys via a dedicated Redis set

Rejected: Redis is not the source of truth for events. Using it for deduplication means
a Redis failure could produce duplicates in PostgreSQL. PostgreSQL constraints are the
right enforcement point.
