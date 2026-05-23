# ADR-022: Schema Registry and Event Schema Compatibility Evolution

**Status:** Accepted  
**Date:** 2026-05-22  
**Deciders:** Engineering

---

## Context

The current schema evolution policy (ADR-013) establishes rules for backward-compatible changes, but it relies entirely on developer discipline. There is no automated enforcement of schema compatibility at publish time. This creates three real risks:

### Risk 1: Silent Contract Breakage

A producer changes a field name (e.g., `user_id` → `userId`) thinking it is a backwards-compatible rename. Consumers that dereference `event.user_id` begin receiving `null` silently. No runtime error. No alert. Data corruption accumulates.

### Risk 2: Undiscoverable Event Schema

There is no place to look up "what does an `order.created` event v2 look like?" Consumers are discovered by reading source code. When producers and consumers are owned by different teams, this breaks down immediately.

### Risk 3: `event_version` Is Not Enforced

The `event_version` field (ADR-010) is stored on every event, but there is no validation that version 2 events actually comply with the version 2 schema. A producer can send `event_version=2` with a version 1 payload.

---

## Decision

### 1. JSON Schema as the Contract Format

Use **JSON Schema (Draft 2020-12)** to define each event type's payload shape. JSON Schema is:
- Language-agnostic (works for Go, TypeScript, Python consumers)
- Human-readable
- Supported by existing validation libraries in all languages
- Composable (schemas can reference shared schemas via `$ref`)

Do NOT use Protobuf or Avro for this system at this stage:
- Protobuf requires a build step in all consumers
- Avro requires a schema registry service dependency on the hot path
- JSON Schema validation can happen entirely in application code with no external service

**Schema storage:** `libs/event-contracts/schemas/{domain}/{event_type}.v{N}.json`

Example: `libs/event-contracts/schemas/order/order.created.v1.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:event-schema:order.created:v1",
  "type": "object",
  "required": ["order_id", "tenant_id", "items", "total_cents"],
  "properties": {
    "order_id": {"type": "string", "format": "uuid"},
    "tenant_id": {"type": "string"},
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["sku", "quantity"],
        "properties": {
          "sku":      {"type": "string"},
          "quantity": {"type": "integer", "minimum": 1}
        }
      }
    },
    "total_cents": {"type": "integer", "minimum": 0}
  },
  "additionalProperties": true
}
```

Note: `additionalProperties: true` is the forward-compatibility stance — consumers must tolerate extra fields they don't know about.

### 2. Compatibility Levels (Aligned with ADR-013)

Four compatibility levels (borrowed from Confluent Schema Registry terminology):

| Level | Definition | Example |
|---|---|---|
| `BACKWARD` | New schema can read data written by old schema | Adding an optional field |
| `FORWARD` | Old schema can read data written by new schema | Removing an optional field (old consumer ignores it) |
| `FULL` | Both backward and forward | Only adding optional fields |
| `NONE` | No compatibility enforcement | Major version bump (breaking change) |

**Default for all events: `FULL` compatibility.** This means:
- Adding required fields → BANNED (old consumers can't read new events)
- Removing required fields → BANNED (new consumers can't read old events)
- Renaming fields → BANNED (treated as remove + add = breaking)
- Adding optional fields → ALLOWED
- Changing field type → BANNED
- Adding a new event type → ALWAYS allowed

Breaking changes require a new `event_version` (e.g., v2) with a new schema file. Both versions coexist. Producers move to v2; consumers upgrade on their own schedule.

### 3. Schema Validation at Ingest Time

The Event Streaming ingest API performs **schema validation when a schema is registered** for that event type. When no schema is registered, the event is accepted (opt-in validation).

Validation is performed in the `ingest.Service.Ingest()` method:
1. Look up the schema for `{event.Type}.v{event.EventVersion}` in the schema registry
2. If not found: accept the event (legacy compatibility)
3. If found: validate `event.Payload` against the schema
4. If invalid: return `HTTP 422` with structured error: `{"error": "payload schema validation failed", "violations": [...]}`

**Schema registry backend:** File-based at startup (load all `.json` schema files from a configurable directory). In the future, this can be replaced with a Kafka Schema Registry API-compatible backend.

```go
type SchemaRegistry interface {
    Validate(eventType string, version int, payload json.RawMessage) error
    Compatible(eventType string, oldVersion, newVersion int) (bool, error)
}
```

### 4. Compatibility Check in CI/CD

Add a CI step that runs on any PR that modifies a schema file:
1. Load the old schema (from `main` branch)
2. Load the new schema (from the PR)
3. Run the compatibility checker
4. Fail the PR if compatibility level is violated

This catches breaking changes at review time, not at runtime.

**Compatibility checker tool:** A simple Go binary at `cmd/schema-compat-check/main.go` that:
1. Parses both schemas
2. Checks for field removals, type changes, required additions
3. Exits non-zero if violations found

### 5. `TypeScript event-contracts` Library Alignment

The TypeScript `@atlas/event-contracts` library in the NestJS platform defines `EventEnvelope<T>`. These interfaces must stay aligned with the JSON Schema definitions.

**Rule:** Every JSON Schema file in `libs/event-contracts/schemas/` must have a corresponding TypeScript interface in `libs/event-contracts/src/`. The CI pipeline validates this alignment:
1. Generate TypeScript types from JSON Schema using `json-schema-to-typescript`
2. Compare generated types with hand-written interfaces
3. Fail if they diverge

This eliminates the TypeScript types diverging from the actual schema definition.

### 6. Schema Evolution Versioning in Kafka

When event_version=2 is introduced:
- The Kafka topic continues to contain both v1 and v2 events (mixed-version stream)
- Consumers must handle both versions
- The `event_version` Kafka header (added in ADR-014) allows consumers to filter without deserialising the body

**Deprecation timeline for old versions:**
1. v2 is deployed to all producers: Week 0
2. v1 consumers updated to understand v2: Week 2
3. v1 is deprecated (still accepted but logged as DEPRECATED): Week 4
4. v1 is rejected at ingest (HTTP 422): Week 12
5. v1 schema is archived: Week 24

---

## What We Are NOT Doing

- **Not adopting a Confluent Schema Registry service.** It's a separate deployment, adds latency on every publish (schema lookup), and requires ZooKeeper/Kafka admin access. The file-based approach is sufficient for this system's scale.
- **Not using Avro or Protobuf.** We're using JSON with schemas. The flexibility of JSON outweighs the binary efficiency gains at this stage.
- **Not enforcing full backward compatibility for replay events.** Replayed events carry the original `event_version`. A consumer receiving a replayed v1 event must handle it even after v2 is the current version.

---

## Migration Strategy

1. **Week 1:** Add schema files for the 5 most critical event types (order.created, tenant.created, workflow.triggered, workflow.completed, user.registered).
2. **Week 2:** Add the `SchemaRegistry` interface and file-based implementation. Wire into ingest service.
3. **Week 3:** Add CI compatibility check script.
4. **Week 4:** Add JSON-Schema → TypeScript type generation step.
5. **Month 2:** Expand schema coverage to all event types.

---

## Observability Implications

- `schema_validation_errors_total{event_type, version}` — detect schema violations in production
- `unknown_schema_events_total{event_type}` — identify event types that lack schemas (migration guide)
- `deprecated_schema_events_total{event_type, version}` — measure old-version usage before forced cutover

---

## Tradeoffs

| Option | Pro | Con |
|---|---|---|
| JSON Schema + file registry | Simple, no new infra, language-agnostic | No dynamic schema updates without deploy |
| Confluent Schema Registry | Industry standard, built-in compatibility check | New infrastructure, latency on hot path |
| Protobuf | Strong typing, efficient binary, code gen | Build step in all consumers, harder to debug |
| Contract tests only | No new tooling | Breaks detected at test time, not commit time |

---

## Operational Risks

- Schema files that drift out of sync with actual event payloads in production cause validation failures for valid events. Ensure schema files are updated before or simultaneously with producer code changes — never after.
- The 422 validation rejection at ingest means a misconfigured producer will start dropping events silently from the consumer's perspective. The ingest error response must be logged by the producer with the full violation list.
