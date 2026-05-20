# ADR-008 — Outbox Pattern for Durable Event Forwarding

**Status:** Accepted  
**Date:** 2026-05-19  
**Deciders:** Platform team

---

## Context

Following ADR-007, all platform events must be forwarded from the SaaS platform to the Event Streaming backbone. The naive approach — calling the Event Streaming HTTP API directly inside the domain command handler — couples event delivery to the domain mutation and fails silently when the external service is unavailable.

Requirements:
- Event forwarding must not fail domain mutations (a network timeout to Event Streaming must not roll back `OrganizationCreated`)
- Events must not be permanently lost if Event Streaming is temporarily down
- Implementation must not require rewriting existing command handlers

---

## Decision

**The Transactional Outbox Pattern is used for durable event forwarding.**

### Implementation

1. **`outbox_entries` table** is added to the SaaS platform's PostgreSQL database. It holds serialized `TenantAwareEvent` payloads with status (`pending` → `processed`/`failed`) and retry metadata.

2. **`ForwardingEventBus`** wraps the existing `IEventBus` adapter. On every `publish()` call, it:
   - Delegates to the inner bus (Redis Streams or In-Memory) — existing behavior unchanged
   - Writes an `OutboxEntryEntity` row to `outbox_entries`

3. **`OutboxProcessorService`** runs on a 5-second interval. It:
   - Fetches up to 50 `pending` outbox entries
   - Calls Event Streaming `POST /events` for each
   - On success: marks the entry `processed`
   - On failure: increments `attempts`, updates `last_error`; after 5 failures marks `failed`

4. **`PlatformEventsModule.forRoot()`** wraps the selected adapter in `ForwardingEventBus` when `EVENT_STREAMING_ENABLED=true`.

### Durability trade-off

The outbox write happens _after_ the inner bus publish, not in the same DB transaction as the domain mutation. This means:

- If the process crashes between the domain commit and the outbox write, the event is delivered to the inner bus but not to Event Streaming.
- For stronger guarantees, domain command handlers can write to the outbox table inside their own TypeORM transaction (using the injected `DataSource`). This is deferred to a future iteration.

The current implementation provides **at-least-once forwarding on a best-effort basis**, which is sufficient while Event Streaming serves as an observability layer rather than a hard availability dependency.

### Configuration

| Environment variable | Description |
|---|---|
| `EVENT_STREAMING_ENABLED=true` | Activates the ForwardingEventBus wrapper |
| `EVENT_STREAMING_BASE_URL` | Base URL of the Event Streaming ingest API |
| `EVENT_STREAMING_API_TOKEN` | Bearer token issued by Event Streaming |
| `EVENT_STREAMING_TIMEOUT_MS` | HTTP timeout per ingest call (default 5000 ms) |

---

## Consequences

### Positive

- Domain mutations are never blocked by Event Streaming unavailability
- Events are not permanently lost — the outbox table holds them until forwarded
- Zero changes to existing command handlers
- `outbox_entries` provides an audit trail of all forwarding attempts and errors

### Negative

- Small window where a crash between domain commit and outbox write means Event Streaming misses the event (mitigated by transactional outbox in future)
- Adds a second write per published event (negligible at current scale)
- `failed` outbox entries require operational monitoring and manual intervention or a sweep job

### Neutral

- The outbox table is tenant-indexed, supporting future per-tenant event replay from the SaaS platform side
- The `OutboxProcessorService` runs in-process; at high throughput a dedicated worker process is a natural extraction

---

## Alternatives Considered

### Direct HTTP call in command handler
Rejected: couples domain mutation to external service availability; a timeout rolls back the user's action.

### Redis Streams as buffer then forward to Event Streaming
Rejected: adds complexity and another component; MAXLEN trimming means events can still be lost.

### Write to outbox in same TypeORM transaction (strict transactional outbox)
Deferred (not rejected): would require modifying all existing command handlers to inject `DataSource`. Correct long-term direction; pragmatically deferred to preserve existing patterns.
