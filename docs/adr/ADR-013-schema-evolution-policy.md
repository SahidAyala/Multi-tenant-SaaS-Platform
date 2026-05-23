# ADR-013 — Event Schema Evolution Policy

**Status:** Accepted  
**Date:** 2026-05-20  
**Deciders:** Platform team

---

## Context

The Atlas platform publishes events consumed across three services and potentially by
future external consumers. Once an event type is in production, its payload schema
must evolve without breaking existing consumers.

Previously, there was no documented policy for schema evolution. This created risk:
- A developer could add a required field to an event payload without realising that
  Workflow Engine consumers, replay jobs, or audit queries would break on old events
- There was no clear distinction between `eventVersion` (schema version) and the stream
  `version` assigned by Event Streaming (see ADR-010)

---

## Decision

### Version numbering

Every event type carries `eventVersion` (an integer starting at 1). This is the
schema/contract version — it changes only when the `payload` shape changes in a way
that may break existing consumers. It is **not** the stream sequence number (`version`
in Event Streaming, which is assigned by the store).

```
eventVersion = 1  →  initial published shape
eventVersion = 2  →  breaking change to payload (see "breaking vs non-breaking" below)
```

### What is a breaking vs non-breaking change?

| Change | Classification | `eventVersion` bump? |
|--------|---------------|---------------------|
| Add optional field to payload | Non-breaking | No |
| Add required field to payload | Breaking | Yes |
| Remove field from payload | Breaking | Yes |
| Rename field | Breaking | Yes |
| Change field type (e.g. int → string) | Breaking | Yes |
| Change field semantics (same name, different meaning) | Breaking | Yes |
| Reorder fields (JSON objects are unordered) | Non-breaking | No |
| Add a new event type | Non-breaking | N/A (new type) |
| Remove an event type | Breaking | N/A (deprecation process) |

### Non-breaking changes: additive only

Non-breaking changes MUST be additive:

```typescript
// ✅ Safe: add optional field
export interface TenantCreatedPayload {
  organizationId: string;
  name: string;
  slug: string;
  plan: string;
  ownerId: string;
  // Added in eventVersion 1 — optional so consumers with older code still work
  billingEmail?: string;
}

// ❌ Unsafe: make existing optional field required
export interface TenantCreatedPayload {
  organizationId: string;
  name: string;
  slug: string;
  plan: string;
  ownerId: string;
  billingEmail: string; // ← was optional, now required → BREAKING
}
```

Go consumers (Workflow Engine, Event Streaming) MUST use `json:",omitempty"` on all
optional fields so new optional fields on older events deserialise as zero-values.

### Breaking changes: versioned parallel types

When a breaking change is unavoidable:

1. **Increment `eventVersion`** on the producer side
2. **Create a new payload interface** (keep the old one for backward compat):
   ```typescript
   // libs/event-contracts/src/tenant/tenant-created.event.ts
   export interface TenantCreatedPayloadV1 { ... }  // old — still used by existing events in ES
   export interface TenantCreatedPayloadV2 { ... }  // new — used by eventVersion: 2 events
   export type TenantCreatedPayload = TenantCreatedPayloadV2; // current default
   ```
3. **Update consumers to dispatch on `eventVersion`**:
   ```typescript
   switch (event.eventVersion) {
     case 1: handleV1(event.payload as TenantCreatedPayloadV1); break;
     case 2: handleV2(event.payload as TenantCreatedPayloadV2); break;
     default: logger.warn('unknown eventVersion', event.eventVersion);
   }
   ```
4. **Run both versions in production** until all events with `eventVersion: 1` have aged
   out of Kafka's retention window and are no longer subject to replay.
5. **Remove the old version handler** only after step 4.

### Consumer upgrade path

Consumers must treat unknown `eventVersion` values as a signal to skip or log-and-continue,
NOT as an error that crashes the consumer. This ensures forward compatibility when a
producer adds a new version before consumers are updated:

```go
// Workflow Engine — EventTriggerService or future type-specific handler
switch event.EventVersion {
case 0, 1:
    // 0 = legacy events before eventVersion was added (treat as v1)
    handleV1(event)
case 2:
    handleV2(event)
default:
    // Unknown future version — log a warning and continue.
    // Do NOT return an error: that would stall the Kafka partition.
    log.Warn("unknown event version — skipping",
        "event_type", event.Type,
        "event_version", event.EventVersion,
        "event_id", event.ID,
    )
}
```

### Event type deprecation

Removing an event type is a three-phase process:
1. Mark as `@deprecated` in the event contract with the removal date
2. After all consumers have removed their handlers, stop producing the event
3. After Kafka retention window has passed, remove the type from the contract

### The "version 0" convention

Events produced before `eventVersion` was introduced have `eventVersion: 0` in the
`IntegrationEvent` struct (Go zero value) or are missing the field entirely (JSON
`omitempty`). All consumers MUST treat `eventVersion: 0` as equivalent to `1`.

This is documented in code comments where `eventVersion` is consumed.

### Schema registry (future)

This policy is deliberately simple: `eventVersion` is a self-describing integer in the
event envelope. A schema registry (e.g. Confluent Schema Registry with Avro or
Protobuf) would provide stronger guarantees (server-side compatibility enforcement,
versioned schema artifacts). Adopting a schema registry is the natural next step when:
- The number of event types exceeds ~20
- Cross-team consumer coordination becomes a bottleneck
- Replay across schema versions becomes frequent

The `eventVersion` field is designed to be the hook for a schema registry integration:
a registry consumer can look up the schema artifact by `(eventType, eventVersion)`.

---

## Consequences

### Positive

- Additive changes require no coordination with consumers
- `eventVersion` gives consumers a clear signal to dispatch on
- "Version 0 = version 1" convention handles legacy events without code branches
- Deprecation process is explicit and documented

### Negative

- Breaking changes require running parallel version handlers for at least one Kafka
  retention window (typically 7 days) — operational complexity
- Without a schema registry, there is no automated enforcement of compatibility rules
  (a developer can publish a breaking change without bumping `eventVersion`)
- Payload interfaces need manual versioning (V1, V2 types)

### Neutral

- JSON is inherently flexible (missing fields = zero values); the biggest risk is
  semantic changes (same field name, different meaning), not syntactic ones
- Events stored in Event Streaming's PostgreSQL are immutable — old events with
  `eventVersion: 1` remain readable even after `eventVersion: 2` is the norm

---

## Related ADRs

- ADR-010: Canonical event envelope (`eventVersion` field definition)
- ADR-007: Event Streaming as canonical backbone (immutable event store)
