# ADR-010 — Canonical Event Envelope

**Status:** Accepted  
**Date:** 2026-05-20  
**Deciders:** Platform team

---

## Context

The Atlas platform spans three services that exchange events:

1. **Multi-Tenant SaaS Platform** (NestJS) — emits `TenantAwareEvent` via outbox → HTTP → Event Streaming
2. **Event Streaming & Audit** (Go) — persists events to PostgreSQL, publishes to Kafka
3. **Workflow Engine** (Go) — consumes from Kafka via `IntegrationEvent`; emits lifecycle events back via HTTP

Each service had its own partial event envelope. The fields diverged:

| Field | NestJS | Event Streaming | Workflow Engine |
|-------|--------|-----------------|-----------------|
| `eventId` / `id` | ✅ | ✅ (uuid) | ✅ |
| `eventType` / `type` | ✅ | ✅ | ✅ |
| `eventVersion` | ❌ (was `version`) | ❌ (only stream `version`) | ❌ |
| `tenantId` / `tenant_id` | ✅ | ✅ | ✅ |
| `correlationId` | ✅ | ✅ | ✅ |
| `actorId` | ✅ in domain | ❌ lost in forwarding | ❌ |
| `causationId` | ✅ in domain | ❌ lost in forwarding | ❌ |
| `traceId` | ❌ | ❌ | ❌ |
| `sourceService` | ❌ | ✅ (`source`) | ✅ (`source`) |
| `sourceVersion` | ❌ | ❌ | ❌ |

Critical problem: `actorId` and `causationId` were present in NestJS domain events but
**silently dropped** when the outbox processor forwarded events to Event Streaming. This
made it impossible to reconstruct *who* caused an event chain or *which event* triggered
a workflow run from the Event Streaming audit log.

---

## Decision

**Standardise a canonical event envelope across all three services.** Every event
at every layer must carry all envelope fields from production to consumption.

### Canonical Envelope Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `eventId` / `id` | UUID string | Yes | Globally unique event instance ID (idempotency key) |
| `eventType` / `type` | string | Yes | Dot-notation type (e.g. `tenant.created`) |
| `eventVersion` / `event_version` | int | Yes | Schema/contract version (starts at 1; see ADR-013) |
| `tenantId` / `tenant_id` | string | Yes | Tenant scope |
| `correlationId` / `correlation_id` | string | Yes | Request-scoped trace ID; never changes across a causal chain |
| `actorId` / `actor_id` | string | Strongly recommended | Who triggered the action (user ID, `"system"`, service name) |
| `causationId` / `causation_id` | string | When applicable | `eventId` of the event that directly caused this one |
| `traceId` / `trace_id` | string | Optional | W3C/B3 distributed trace ID (for future OTel integration) |
| `sourceService` / `source` | string | Yes | Name of the service that produced the event |
| `sourceVersion` / `source_version` | string | Optional | Semantic version of `sourceService` at time of emission |
| `occurredAt` / `occurred_at` | ISO-8601 / timestamp | Yes | When the domain event occurred |
| `payload` | JSON object | Yes | Event-type-specific data |

### Critical Distinction: `eventVersion` vs stream `version`

These two fields share the word "version" but are **completely different concepts**:

- **`eventVersion` (schema version)** — incremented when the `payload` shape of an
  event type changes in a breaking way. Lives in the event envelope. Consumers use it
  to select the right deserialiser.
- **`version` (stream sequence)** — monotonically increasing integer assigned by
  Event Streaming's store on Append. It orders events within a stream and is used
  for optimistic concurrency and replay. Never set by producers.

### Forwarding Chain

```
NestJS DomainEvent
  (eventVersion, actorId, causationId, traceId, sourceService, sourceVersion)
        │
        │  ForwardingEventBus.writeToOutbox()
        ▼
outbox_entries (all fields stored in dedicated columns)
        │
        │  OutboxProcessorService → EventStreamingHttpClient
        │  X-Correlation-ID, X-Causation-ID, X-Trace-ID headers
        │  actor_id, causation_id, trace_id, event_version in request body
        ▼
Event Streaming POST /events
  (stores all as first-class columns: event_version, causation_id, actor_id, trace_id, source_version)
        │
        │  Kafka producer — serialises full Event struct (all new fields included)
        ▼
Kafka topic (full envelope in message value JSON)
        │
        │  Workflow Engine Kafka consumer → IntegrationEvent unmarshal
        ▼
EventTriggerService.Handle()
  (logs causation_id, actor_id, trace_id for traceability)
        │
        │  Workflow lifecycle events (WorkflowRunStarted, StepRunFailed, etc.)
        │  causation_id = source_event_id that triggered the run
        ▼
Event Streaming POST /events (lifecycle events carry full envelope)
```

### Causation Chain Preservation

When a workflow run is created by an integration event:
- The workflow lifecycle events set `causationId` = triggering event's `ID`
- This allows Event Streaming to reconstruct the full lineage:
  `tenant.created` → `workflow.run.started` → `workflow.step.started` → ...

### Transport of New Fields

New fields cross service boundaries via:
1. **Outbox → Event Streaming HTTP**: body fields (`event_version`, `causation_id`, `actor_id`,
   `trace_id`) plus request headers (`X-Causation-ID`, `X-Trace-ID`)
2. **Event Streaming → Kafka**: serialised in the `Event` struct JSON value
3. **Workflow Engine → Event Streaming HTTP**: body fields plus headers

---

## Consequences

### Positive

- Full causation chain is preserved across all service boundaries
- `actor_id` is queryable in Event Streaming for per-user audit trails
- `causation_id` enables graph reconstruction of event chains (platform event → workflow)
- `traceId` is infrastructure-ready for OpenTelemetry without additional schema changes
- `eventVersion` is explicitly distinct from stream `version` — no more naming confusion

### Negative

- **Schema migration required** for Event Streaming's `events` table (new columns).
  Handled via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — safe for live databases.
- **ORM migration required** for NestJS `outbox_entries` table (new columns).
  TypeORM will generate the migration on next `make migrate-generate`.
- All existing handlers that construct `TenantAwareEvent` inline must supply
  `eventVersion` and `sourceService`. This is enforced at TypeScript compile time.

### Neutral

- `actorId` is optional in `TenantAwareEvent` (existing events without it are valid).
- `causationId` is only set when an event is a reaction to another event.
- `traceId` is optional — absence means OTel is not yet wired at that call site.

---

## Alternatives Considered

### Store new fields only in `metadata` (map[string]string)

Rejected for `actorId` and `causationId`: these are query targets (audit who did what,
reconstruct causation chains). Embedding them in JSONB `metadata` means no index and
awkward JSONB queries. First-class columns with dedicated indexes are the right model.

`traceId` and `sourceVersion` are stored in metadata-equivalent columns but also have
first-class column representations to keep the wire format consistent.

### Use a schema registry (e.g. Confluent Schema Registry)

Deferred (not rejected): a schema registry provides compile-time consumer safety and
server-side enforcement. The platform is not yet at the scale where Confluent's
operational overhead is justified. `eventVersion` in the envelope provides the
consumer-side hook needed to introduce a registry later without breaking changes.

---

## Related ADRs

- ADR-007: Event Streaming as canonical backbone
- ADR-008: Outbox pattern for durable event forwarding
- ADR-009: Event-driven workflow triggers
- ADR-013: Event schema evolution policy
