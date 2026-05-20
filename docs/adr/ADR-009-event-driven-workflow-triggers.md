# ADR-009 — Event-Driven Workflow Triggers via Kafka

**Status:** Accepted  
**Date:** 2026-05-19  
**Deciders:** Platform team

---

## Context

The Workflow Engine needs to react to platform events. Examples:

| Platform event | Desired automated response |
|---|---|
| `tenant.created` | Trigger onboarding workflow |
| `identity.user.invited` | Send invitation email workflow |
| `tenant.subscription.changed` | Billing reconciliation workflow |
| `identity.rbac.violation` | Security escalation workflow |

Previously the only way to trigger a workflow was a direct HTTP call (`POST /workflows/:id/runs`). This creates tight coupling: the SaaS platform would need to know which workflow IDs exist in the Workflow Engine, and would need to call it synchronously.

---

## Decision

**The Workflow Engine subscribes to the Event Streaming Kafka topics and triggers workflows based on configurable `event_triggers` mappings.**

### Mechanism

1. **Event Streaming publishes all ingested events to Kafka.** After each `POST /events` the Event Streaming service publishes the event JSON to a Kafka topic (already implemented in the existing Event Streaming codebase).

2. **The Workflow Engine runs a Kafka consumer** (`internal/infrastructure/kafka/consumer.go`) that reads from the configured topic with consumer-group semantics (at-least-once delivery).

3. **`event_triggers` table** maps `(project_id, event_type)` → `workflow_id`. One event type can map to at most one workflow per project. Triggers can be activated/deactivated without code changes.

4. **Tenant bridging:** Projects in the Workflow Engine carry an `external_tenant_id` column that maps to the `tenantId` used by the SaaS platform. When an event arrives, `EventTriggerService` looks up the matching trigger by `(external_tenant_id, event_type)`.

5. **`EventTriggerService.Handle()`** creates a `workflow_run` and its `step_runs` atomically for the matched workflow, then returns. The existing executor picks up the pending run on its next poll cycle.

6. **No synchronous coupling:** the SaaS platform publishes events and is unaware of whether any workflow is triggered. The Workflow Engine operates on its own schedule.

### Configuration (Workflow Engine)

| Environment variable | Description |
|---|---|
| `KAFKA_BROKERS` | Comma-separated Kafka broker addresses |
| `KAFKA_EVENTS_TOPIC` | Topic name (matches Event Streaming's publish topic) |
| `KAFKA_CONSUMER_GROUP` | Consumer group ID (default: `workflow-engine`) |

When `KAFKA_BROKERS` is unset, the Kafka consumer does not start and direct HTTP triggers remain the only mechanism.

### Tenant mapping setup

When provisioning a new tenant in the Workflow Engine, set the project's `external_tenant_id` to match the SaaS platform's `tenantId`. Example (SQL):
```sql
UPDATE projects SET external_tenant_id = 'acme-corp-uuid' WHERE slug = 'acme-corp';
```

---

## Consequences

### Positive

- Zero coupling between SaaS platform and Workflow Engine at the code level — only shared Kafka topic + event type strings
- Adding a new event-to-workflow mapping requires only an `INSERT INTO event_triggers` — no deployment
- Deactivating a trigger is a single `UPDATE is_active = FALSE` — no code change
- Kafka consumer group semantics provide at-least-once delivery and horizontal scaling (multiple Workflow Engine workers can participate in the same group)
- Correlation IDs propagate from the original platform event through the workflow run

### Negative

- Workflow trigger latency is bounded by Kafka consumer poll interval (typically milliseconds to seconds) rather than synchronous sub-100ms HTTP
- `external_tenant_id` mapping must be kept in sync with the SaaS platform's tenant IDs; a mismatch silently means events are not matched
- At-least-once delivery means a workflow could be triggered twice for the same event under failure scenarios; workflows should be idempotent where possible

### Neutral

- The Kafka consumer is optional — disabling `KAFKA_BROKERS` reverts to HTTP-only triggers, preserving backward compatibility
- The `event_triggers` API (CRUD endpoints) is not yet implemented; initial setup is via direct SQL until a management UI is built

---

## Alternatives Considered

### Direct HTTP call from SaaS platform to Workflow Engine
Rejected: tight coupling, synchronous dependency, requires the SaaS platform to know Workflow Engine's internal IDs.

### Webhook-based triggers
Rejected: requires the SaaS platform to manage webhook registrations and retry logic — effectively reimplementing the outbox pattern for a different transport.

### Polling the Event Streaming query API from Workflow Engine
Rejected: adds a polling loop against a query endpoint; Kafka consumer is more efficient and idiomatic for this pattern.
