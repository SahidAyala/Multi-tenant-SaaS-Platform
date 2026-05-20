# ADR-007 — Event Streaming & Audit as Canonical Event Backbone

**Status:** Accepted  
**Date:** 2026-05-19  
**Deciders:** Platform team

---

## Context

The Atlas platform consists of three systems:

- **Multi-Tenant SaaS Platform** (NestJS) — the business core; owns tenant, identity, workflow, and audit domains
- **Event Streaming & Audit** (Go) — append-only event store (PostgreSQL) + Kafka distribution + Elasticsearch read model
- **Workflow Engine** (Go) — orchestration engine; executes multi-step workflows

Each system was built independently with its own event-handling mechanisms:
- The SaaS platform has a Redis Streams-based `IEventBus` and a local `audit_events` PostgreSQL table.
- The Event Streaming service has a durable, append-only event store with Kafka fan-out.
- The Workflow Engine had no event infrastructure.

Operating them in isolation creates:
- Duplicate audit stores with no single authoritative record
- No tenant activity timeline spanning all three systems
- No mechanism for the Workflow Engine to react to platform events
- Observability fragmented across three codebases

---

## Decision

**The Event Streaming & Audit service becomes the canonical event backbone for the entire platform.**

Concretely:

1. **All `TenantAwareEvent` publications from the SaaS platform are forwarded to the Event Streaming ingest API** (via the outbox pattern — see ADR-008). This makes Event Streaming the authoritative, immutable record of everything that happened across the platform.

2. **Stream naming convention** adopted for platform events:
   ```
   platform.{tenantId}.{eventType}    — tenant-scoped stream
   workflow.project.{projectId}        — fallback when tenant mapping is absent
   ```

3. **The local `audit_events` table in the SaaS platform is preserved** for now to serve existing audit queries within the bounded context. Long-term, the audit query path should be migrated to read from Event Streaming's query API, and the local table can be retired.

4. **The Workflow Engine publishes lifecycle events** (`workflow.run.started`, `workflow.run.completed`, etc.) to Event Streaming, completing the tenant activity timeline.

5. **Event Streaming's Kafka topics become the trigger mechanism** for the Workflow Engine (see ADR-009).

---

## Consequences

### Positive

- Single source of truth for the entire platform's event history
- Tenant activity timeline is unified and queryable from one place
- Replay capability (Event Streaming already supports `GET /streams/{streamID}/events`) covers all systems
- Audit compliance: immutable, append-only PostgreSQL store
- Event Streaming's Elasticsearch read model provides cross-tenant search over all platform events
- Clear extraction boundary: each system remains independently deployable; they only share HTTP/Kafka interfaces

### Negative

- The SaaS platform's local `AuditEventRepository` is now partially redundant. Migration to fully remove it is deferred.
- The forwarding path introduces a second write per event (outbox entry). See ADR-008 for durability trade-offs.
- Event Streaming becomes a dependency for full observability. Its availability affects audit completeness (not correctness — see ADR-008).

### Neutral

- The `TenantAwareEvent` contract in `@atlas/event-contracts` already carries all required metadata (`tenantId`, `correlationId`, `occurredAt`, etc.) — no schema change needed.
- Event Streaming authentication uses its existing JWT/API-key mechanism.

---

## Alternatives Considered

### Keep audit local, add separate observability layer
Rejected: duplicates data, no cross-system timeline, maintenance burden of two audit systems.

### Use Redis Streams as the canonical backbone
Rejected: Redis Streams is ephemeral (MAXLEN trim), has no durable replay, and is not designed as an append-only audit store.

### Synchronous HTTP coupling between services
Rejected: direct HTTP calls between bounded contexts create tight coupling and cascading failures.
