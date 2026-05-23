# ADR-020: OpenTelemetry, Metrics Strategy, and SLO Definitions

**Status:** Accepted  
**Date:** 2026-05-22  
**Deciders:** Engineering

---

## Context

The current system has:
- **Structured logging** (slog in Go, NestJS default logger) — good foundation
- **Correlation IDs and W3C TraceContext** propagated across HTTP and Kafka (ADR-014)
- **No metrics instrumentation** — no Prometheus counters, histograms, or gauges anywhere
- **No distributed tracing spans** — trace IDs propagated but no spans created or exported
- **No SLO definitions** — no agreement on what "the system is healthy" means

The result is an observability blind spot: when the system is degrading, there is no early warning. The first indicator of a problem is a user complaint or a service outage. At production scale, this is unacceptable.

### Why the Current Approach Will Fail

The current `trace.go` shim in the Event Streaming service is intentionally minimal — it propagates trace IDs as strings but creates no spans. This is the right short-term choice (no OTel SDK dependency). The problem is that without spans:

1. **You cannot measure latency distributions** — you don't know if p99 ingest latency is 5ms or 500ms until you look at logs.
2. **You cannot identify bottlenecks** — no way to see "90% of ingest time is spent in the PostgreSQL Append call."
3. **You cannot correlate across services** — the trace ID exists but there's nothing to query in a trace backend (Jaeger, Tempo) because no spans were exported.
4. **You cannot set SLOs** — without metrics, "99.9% of requests succeed in <100ms" is unverifiable.

---

## Decision

### 1. Adopt the OpenTelemetry Go SDK (Event Streaming and Workflow Engine)

Replace the custom `trace` shim with the OpenTelemetry SDK in a backwards-compatible way. The current `trace.TraceContext` type and all its propagation functions remain — they are wrapped by the OTel SDK, not replaced.

**Migration plan (zero-breaking-change):**

Step 1 — Add OTel as an optional dependency:
```go
// otel_setup.go (new file, only imported when OTEL_EXPORTER_OTLP_ENDPOINT is set)
func SetupOTel(ctx context.Context, svcName, svcVersion string) (func(), error) {
    // configures OTLP exporter, TracerProvider, TextMapPropagator
    // TextMapPropagator = W3C TraceContext — maps directly to our trace.TraceContext
}
```

Step 2 — Replace `trace.NewTraceID()` with OTel span creation at handler entry points:
```go
// Before (current):
tc = trace.TraceContext{TraceID: trace.NewTraceID(), Sampled: true}

// After (OTel):
ctx, span := otel.Tracer("ingest-api").Start(r.Context(), "ingest.handler")
defer span.End()
tc = trace.TraceContext{TraceID: span.SpanContext().TraceID().String(), ...}
```

Step 3 — Instrument critical paths with child spans:
- `postgres.Append` → span `store.append` with attributes `stream_id`, `tenant_id`
- `kafka.Publish` → span `kafka.publish` with attributes `topic`, `stream_id`
- `elasticsearch.Index` → span `es.index`
- `replay.Execute` → span `replay.execute` with attributes `matched_count`

Step 4 — Configure OTLP exporter (disabled by default, activated via env):
```
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
OTEL_SERVICE_NAME=event-streaming-api
OTEL_SERVICE_VERSION=1.0.0
```

When `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, OTel uses a no-op exporter — zero performance cost, no change in behaviour for existing deployments.

### 2. Prometheus Metrics (Separate from OTel Traces)

Add Prometheus metrics as a separate `GET /metrics` endpoint in the Event Streaming ingest-api and Workflow Engine API. This is the lowest-barrier first step to observability.

**Core metric set — Event Streaming:**

```
# Counters
ingest_events_total{tenant_id, event_type, status}          # ingested events (success/failure)
kafka_publish_total{topic, status}                           # kafka publishes (success/failure)
replay_events_total{status, dry_run}                         # replay executions
es_index_total{status}                                       # ES indexing operations

# Histograms (p50/p95/p99)
ingest_duration_seconds{tenant_id}                           # full ingest path latency
postgres_append_duration_seconds                             # store write latency
kafka_publish_duration_seconds                               # kafka write latency
es_index_duration_seconds                                    # ES write latency
http_request_duration_seconds{method, path, status_code}    # HTTP handler latency

# Gauges
kafka_consumer_lag{topic, partition, consumer_group}        # messages behind head
postgres_pool_open_connections                               # active DB connections
postgres_pool_idle_connections                               # idle DB connections
replay_in_progress                                           # active replay operations
```

**Core metric set — Workflow Engine:**

```
# Counters
workflow_runs_total{status}                    # runs created/completed/failed
step_runs_total{step_type, status}             # step executions
kafka_trigger_events_total{matched}            # events processed for triggers

# Histograms
workflow_run_duration_seconds{status}          # end-to-end run time
step_execution_duration_seconds{step_type}     # per-step type latency

# Gauges
pending_step_runs                              # queue depth waiting execution
workflow_executor_poll_interval_ms             # adaptive poll interval
```

**NestJS metrics** are added via `@willsoto/nestjs-prometheus` or the official `@opentelemetry/sdk-node` package.

### 3. SLO Definitions

| Service | SLI | Target | Error Budget/Month |
|---|---|---|---|
| Ingest API | Success rate (non-5xx / total) | 99.9% | 43 minutes downtime |
| Ingest API | p99 latency < 200ms | 99% of requests | 1% of requests allowed |
| ES indexing | Lag < 30s from ingest | 99% of events | 1% events delayed |
| Kafka publish | Success rate | 99% | Non-blocking; Postgres is durable |
| Workflow trigger | p99 trigger-to-run latency < 5s | 99% | 1% of triggers |
| Replay API | Success rate | 99.9% | — |

These SLOs are measured by Prometheus recording rules, not individual metric scrapes.

**Burn rate alerts** (more meaningful than threshold alerts):
- Fast burn (1h window): 2% error budget consumed → page immediately
- Slow burn (6h window): 10% error budget consumed → ticket + investigation

### 4. Grafana Dashboard Definitions

Four canonical dashboards (implemented as Grafana JSON files in `docs/dashboards/`):

1. **Ingest API Overview** — request rate, error rate, p50/p95/p99 latency, active tenants
2. **Event Pipeline Health** — Kafka producer success rate, consumer group lag per partition, ES indexing lag, replay in-progress
3. **Workflow Engine** — pending steps, run completion rate, step failure rate, p95 execution time per step type
4. **Error Budget** — SLO burn rate per service, remaining budget per month, alert status

### 5. Alerting Rules (Prometheus Alertmanager)

```yaml
# Critical — page immediately
- alert: IngestAPIHighErrorRate
  expr: rate(ingest_events_total{status="error"}[5m]) / rate(ingest_events_total[5m]) > 0.01
  for: 2m

- alert: KafkaConsumerLagCritical
  expr: kafka_consumer_lag > 50000
  for: 5m

- alert: DeadLetterEventDetected
  expr: increase(kafka_dead_letter_total[5m]) > 0

# Warning — investigate during business hours
- alert: IngestLatencyDegraded
  expr: histogram_quantile(0.99, http_request_duration_seconds) > 0.5
  for: 10m

- alert: ElasticsearchIndexingBehind
  expr: kafka_consumer_lag{consumer_group="es-indexer-v1"} > 10000
  for: 10m
```

---

## Migration Strategy

### Phase 1 — Prometheus only (2 weeks)
1. Add `prometheus/client_golang` to Event Streaming go.mod
2. Instrument ingest handler, postgres.Append, kafka.Publish with counters and histograms
3. Expose `GET /metrics` endpoint (no auth required, add network policy to restrict to scraper)
4. Deploy Prometheus + Grafana in Docker Compose for local development
5. Define the 4 Grafana dashboards

### Phase 2 — OTel traces (4 weeks after Phase 1)
1. Add `go.opentelemetry.io/otel` as a dependency
2. Wrap existing `trace.TraceContext` shim with OTel SDK (backwards-compatible)
3. Instrument 3 critical spans: ingest handler, postgres.Append, kafka.Publish
4. Deploy OTel Collector sidecar (receives from service, exports to Jaeger/Tempo)
5. Verify traces appear in Jaeger with correct parent-child relationships

### Phase 3 — NestJS OTel (4 weeks after Phase 2)
1. Add `@opentelemetry/sdk-node` auto-instrumentation to NestJS
2. Connect outbox processor spans to Event Streaming spans via traceparent header
3. Full cross-system trace visible in a single Jaeger trace

---

## Tradeoffs

| Approach | Pro | Con |
|---|---|---|
| Prometheus-first | Simple, battle-tested, no changes to hot path | No distributed traces; can't drill into individual requests |
| OTel-first | Full traces from day 1 | More complex SDK setup; vendor-specific decisions |
| Custom metrics only | No new deps | Non-standard; harder to integrate with external tools |

**Chosen:** Prometheus-first for immediate observability value, OTel traces as a second phase. The two are complementary: Prometheus gives you fleet-level health signals, OTel gives you per-request drill-down.

---

## Operational Risks

- Adding metrics instrumentation to the hot path (ingest handler) adds ~1μs per request for histogram observation. This is negligible.
- OTel SDK `Start()` call on every request adds ~5μs at the span creation level. For 1000 req/s, this is 5ms/s of extra CPU — acceptable.
- Prometheus scrape every 15s with 100+ metrics per service = ~50KB per scrape. Not a concern at this scale.
- Label cardinality must be controlled: never use `event_id` or `stream_id` as a Prometheus label (unbounded cardinality bloats TSDB). Only use `tenant_id` for labels that are bounded by the tenant count.
