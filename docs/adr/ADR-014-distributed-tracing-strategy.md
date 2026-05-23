# ADR-014 — Distributed Tracing Strategy

**Status:** Accepted  
**Date:** 2026-05-21  
**Deciders:** Platform team

---

## Context

The Atlas platform spans three services that communicate asynchronously:

```
SaaS Platform (NestJS)
  → HTTP → Event Streaming (Go)
  → Kafka → Workflow Engine (Go)
  → HTTP → Event Streaming (lifecycle events)
```

A single user action (e.g. "create organization") can produce:
- An outbox entry in the SaaS platform
- An event in Event Streaming
- A Kafka message consumed by Workflow Engine
- Multiple workflow lifecycle events back in Event Streaming

Before this ADR there was no standardised way to link a log line in Workflow Engine
to the HTTP request that originally caused it. `correlationId` was propagated
over HTTP but **not** over Kafka message headers, and was not linked to any
external tracing system.

---

## Decision

### Propagation format — W3C TraceContext

Use the [W3C TraceContext](https://www.w3.org/TR/trace-context/) `traceparent`
header as the canonical propagation wire format. This is the standard adopted by
OpenTelemetry and natively understood by most observability backends.

```
traceparent: 00-{traceId}-{parentSpanId}-{flags}
  version   : 00 (fixed)
  traceId   : 128-bit trace ID, 32 lowercase hex chars
  parentSpanId : 64-bit span ID of the producing service, 16 lowercase hex chars
  flags     : 01 (sampled) or 00 (not sampled)
```

Example:
```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

### The `traceId` field in the canonical envelope

The canonical event envelope carries `traceId` (the 32-hex trace ID, no dashes).
This is the same value embedded in `traceparent`. It enables:
- Filtering events in Event Streaming by trace ID (PostgreSQL index)
- Correlating events to an external APM tool using the same trace ID

The `parentSpanId` is **not** stored on the event — it is transport metadata, not
event identity.

### Propagation across service boundaries

#### HTTP (NestJS → Event Streaming)

Every outbound request from the outbox processor includes:
```
traceparent: 00-{traceId}-{outboxSpanId}-01
X-Correlation-ID: {correlationId}
X-Causation-ID: {causationId}   (when present)
```

Event Streaming's chi middleware extracts `traceparent`, stores the traceId in
the request context, and echoes it in the response.

#### Kafka (Event Streaming → Workflow Engine)

Every Kafka message published by Event Streaming includes message headers:
```
traceparent: 00-{traceId}-{producerSpanId}-01
correlation_id: {correlationId}
```

Workflow Engine's Kafka consumer extracts `traceparent` from the message headers
and attaches the traceId to the structured log fields for every message it
processes.

#### Within a service

Go services use `context.Context` to carry the trace context within a request.
The `internal/pkg/trace` package provides:
- `TraceContext` struct (traceId, spanId, parentSpanId, flags)
- `ParseTraceparent` — decode `traceparent` header value
- `FormatTraceparent` — encode for outbound header
- `NewSpanID` — generate a cryptographically random 64-bit span ID
- `WithTraceContext` / `TraceContextFromContext` — context storage

NestJS uses `AsyncLocalStorage` (already in place for tenant context) to carry
the trace context across async boundaries.

### OpenTelemetry readiness

The field names and wire format are intentionally identical to OpenTelemetry
semantic conventions. When OTel SDK is adopted:

1. Replace `internal/pkg/trace.ParseTraceparent` with
   `go.opentelemetry.io/otel/propagation.TraceContext{}.Extract()`
2. Add an OTel exporter (Jaeger/OTLP) in `main.go`
3. All existing `traceId` values in the event store, Elasticsearch, and logs
   are valid OTel trace IDs — no data migration needed

**No OTel exporter is configured today.** The trace package is a lightweight
shim that establishes the propagation contract without pulling in the full SDK.
The `go.opentelemetry.io/otel` dependency is already present in Event Streaming's
`go.mod` (transitively required) — activating it is additive.

### Structured logging correlation

Every log line in all three services MUST include these fields when a request or
event is being processed:

| Field | Source |
|-------|--------|
| `correlation_id` | From HTTP header or Kafka header |
| `trace_id` | Extracted from `traceparent` |
| `tenant_id` | From auth identity or event envelope |
| `event_id` | When processing a specific event |
| `causation_id` | When emitting a reactive event |

These fields are the minimum required to reconstruct an incident from logs alone
(see ADR-017).

### What changes per service

#### SaaS Platform (NestJS)
- `TenantContextMiddleware` now parses incoming `traceparent`, extracts `traceId`,
  stores it alongside `correlationId` in `AsyncLocalStorage`
- `EventStreamingHttpClient` sends `traceparent` on every outbound request
- `TenantAwareEvent` interface carries `traceId` (already exists); no new fields
  for span tracking

#### Event Streaming (Go)
- New `internal/infrastructure/httpserver/middleware/trace.go` chi middleware:
  extracts/generates `traceparent`, stores in context
- `internal/pkg/trace` package extended with W3C TraceContext support
- Kafka producer injects `traceparent` as a Kafka message header

#### Workflow Engine (Go)
- Kafka consumer extracts `traceparent` header from incoming messages
- `TraceID` from the message is attached to all structured log fields
- Lifecycle events published back to Event Streaming carry `TraceID`

---

## Consequences

### Positive

- A single `traceId` links: HTTP request → outbox → Event Streaming event → Kafka
  message → Workflow Engine processing → lifecycle events
- No OTel SDK required yet — the shim is 50 lines
- When OTel is adopted, field names are already correct; no event store migration

### Negative

- `traceparent` propagation must be explicitly threaded through every new service
  boundary; it won't happen automatically without the full OTel SDK
- `parentSpanId` (for span hierarchy) is available in logs but not stored on events;
  APM span trees require OTel SDK to be complete

### Neutral

- `correlationId` and `traceId` are now redundant for new requests (both carry
  the same trace-level identifier). The distinction: `correlationId` is the
  Atlas-internal request ID (always set, even without tracing); `traceId` is the
  W3C trace ID (set only when a `traceparent` header was received or generated).
  During the transition period, systems that don't yet propagate `traceparent`
  still correlate events via `correlationId`.

---

## Related ADRs

- ADR-010: Canonical event envelope (`traceId` field definition)
- ADR-015: Replay architecture (replay events carry original `traceId`)
- ADR-017: Incident reconstruction model (uses `traceId` for cross-system queries)
