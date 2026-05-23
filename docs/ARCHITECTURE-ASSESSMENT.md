# Architecture Assessment: Production Hardening Roadmap

**Date:** 2026-05-22  
**Scope:** Event Streaming & Audit, Workflow Engine, Multi-tenant SaaS Platform (NestJS)

---

## Executive Summary

The platform has a sound architectural foundation: hexagonal architecture, append-only event store, W3C trace propagation, replay API with safety guarantees, and causation-chain inspection. The core data model is correct.

**What is absent** is the operational layer that makes production systems reliable under load: no metrics, no circuit breakers, no backpressure, concurrent executor race conditions, and unbounded table growth. These are not edge cases — they are guaranteed failure modes at 100+ req/s or with 10+ tenants.

The seven most dangerous issues are:

| # | Issue | Service | Failure Mode |
|---|---|---|---|
| **D1** | `GetNextPendingStepRun` has no `FOR UPDATE SKIP LOCKED` | Workflow Engine | Duplicate step execution at >1 executor instance |
| **D2** | No PostgreSQL connection pool limits | All | DB exhaustion crashes all services simultaneously |
| **D3** | No circuit breaker on Kafka publish | Event Streaming | 10s × N goroutine pile-up during broker outage |
| **D4** | NestJS outbox retries are immediate (no backoff) | NestJS | Thundering herd makes recovery worse |
| **D5** | Events table is unpartitioned and unbounded | Event Streaming | Query degradation and disk exhaustion at 6 months |
| **D6** | No consumer lag monitoring | All | Silent data loss undetected until user complaint |
| **D7** | No schema compatibility enforcement | All | Silent breaking changes between producers and consumers |

---

## Impact / Complexity Matrix

```
HIGH IMPACT
     │
     │  ┌──────────────────────┐  ┌──────────────────────┐
     │  │  D1: SKIP LOCKED     │  │  D5: Table partition  │
     │  │  D2: Pool limits     │  │  ADR-020: Prometheus  │
     │  │  D4: Outbox backoff  │  │  ADR-023: WF timeout  │
     │  └──────────────────────┘  └──────────────────────┘
     │     LOW COMPLEXITY              HIGH COMPLEXITY
     │
     │  ┌──────────────────────┐  ┌──────────────────────┐
     │  │  D6: Consumer lag    │  │  ADR-021: Archival    │
     │  │  D3: Circuit breaker │  │  ADR-022: Schema reg  │
     │  │  Poll jitter         │  │  ADR-018: 24 parts    │
     │  └──────────────────────┘  └──────────────────────┘
LOW IMPACT
```

---

## Prioritized Roadmap

### P0 — Do This Week (Data Safety, No-Downtime)

These are bugs, not features. Each takes < 2 hours to implement.

| Task | File | Change | Risk |
|---|---|---|---|
| Add `FOR UPDATE SKIP LOCKED` | `workflow-engine/internal/infrastructure/db/step_run_repository.go` | Single SQL change | Low — safe to deploy any time |
| Add PostgreSQL pool config | `event-streaming/internal/config/config.go` + store init | Add env vars `POSTGRES_POOL_MAX`, read in `pgxpool.ParseConfig` | Low |
| Add `POSTGRES_POOL_MAX` to WF engine | `workflow-engine/internal/infrastructure/db/postgres.go` | Read from env instead of hard-coding | Low |
| Outbox exponential backoff | `Multi-tenant-SaaS-Platform/.../outbox-processor.service.ts` | Add `next_run_at` field to entry, implement backoff | Medium — requires DB migration |
| WF Kafka consumer: add sleep between retries | `workflow-engine/internal/infrastructure/kafka/consumer.go` | ~10 lines | Low |

### P1 — Next Sprint (Observability Foundation)

| Task | ADR | Effort |
|---|---|---|
| Prometheus metrics in Event Streaming | ADR-020 | 3 days |
| `GET /metrics` endpoint + ingest/postgres/kafka counters | ADR-020 | 1 day (part of above) |
| Consumer lag monitoring setup | ADR-018 | 1 day |
| Circuit breaker on Kafka producer | ADR-019 | 2 days |
| Executor poll jitter + exponential backoff on empty queue | ADR-023 | 1 day |
| Workflow run timeout_at column + watchdog goroutine | ADR-023 | 2 days |

### P2 — Next Month (Reliability Hardening)

| Task | ADR | Effort |
|---|---|---|
| Per-tenant rate limiting (in-memory token bucket) | ADR-019 | 3 days |
| Prometheus metrics in Workflow Engine | ADR-020 | 2 days |
| Grafana dashboards (4 canonical dashboards) | ADR-020 | 3 days |
| Schema validation at ingest (JSON Schema, file registry) | ADR-022 | 4 days |
| Elasticsearch ILM policy | ADR-021 | 1 day |
| Separate consumer groups: `es-indexer-v1`, `wf-trigger-v1` | ADR-018 | 1 day |

### P3 — Next Quarter (Scalability Infrastructure)

| Task | ADR | Effort |
|---|---|---|
| PostgreSQL table partitioning by month | ADR-021 | 5 days (+ maintenance window) |
| OTel SDK integration (Event Streaming) | ADR-020 | 5 days |
| Kafka replication factor = 3, 24 partitions | ADR-018 | 1 day (+ broker provisioning) |
| Bounded consumer worker pool | ADR-019 | 3 days |
| S3 archival pipeline for events older than 90 days | ADR-021 | 5 days |
| CI schema compatibility checker | ADR-022 | 3 days |
| Async replay for large batches (>100 events) | ADR-019 | 4 days |

### P4 — Future (Strategic)

| Task | Notes |
|---|---|
| Stream snapshot API | When stream hydration cost becomes measurable |
| ClickHouse for analytics queries | When Elasticsearch aggregation queries exceed 5s |
| OTel traces in NestJS | After Go OTel is stable |
| Redis-based distributed rate limiting | When rate limiter needs cross-instance state |
| Multi-region active/passive setup | When SLA requires >99.9% availability |
| Schema Registry service | When JSON Schema file approach becomes operationally burdensome |

---

## Bottleneck Forecast

| Scale Point | First Bottleneck | Time to Failure | Fix |
|---|---|---|---|
| 5 executor instances | Duplicate step execution (D1) | Immediate | `FOR UPDATE SKIP LOCKED` |
| 100 tenants | DB connection exhaustion | 1-2 weeks | Pool limits (D2) |
| 1M events/day | Events table query degradation | 3-6 months | Partitioning |
| Kafka outage | Ingest API goroutine pile-up | First outage | Circuit breaker (D3) |
| 10 replay operations running simultaneously | PostgreSQL lock contention | Immediate | Replay concurrency limit |
| 10 outbox instances during ES outage | Thundering herd (D4) | First outage | Outbox backoff |
| 50k events in one stream | Stream hydration cost | 6-12 months | Snapshots |

---

## What the Current System Does Well

These are NOT problems. Do not change them.

1. **Append-only store with per-stream versioning** — correct data model for event sourcing
2. **PostgreSQL as source of truth, Kafka as best-effort** — eliminates dual-write consistency problems
3. **Replay API with dry-run, safety limits, and reasons** — operationally safe
4. **W3C TraceContext propagation** — cross-system correlation already works
5. **Hexagonal architecture** — infrastructure swappable without touching domain logic
6. **Topic resolver abstraction** — single-topic vs multi-topic routing is a configuration change
7. **Exponential backoff in workflow step retries** — already implemented correctly
8. **Idempotency via processed_integration_events** — correct design
9. **Causation chain inspection and tenant timeline** — unique debugging capability

---

## ADR Index for This Assessment

| ADR | Title | Status | Priority |
|---|---|---|---|
| ADR-018 | Kafka Partitioning and Consumer Scaling | Accepted | P2-P3 |
| ADR-019 | Backpressure, Rate Limiting, Graceful Degradation | Accepted | P0-P2 |
| ADR-020 | OpenTelemetry, Metrics, and SLO Strategy | Accepted | P1-P3 |
| ADR-021 | Event Retention, Archival, and Snapshot Strategy | Accepted | P2-P3 |
| ADR-022 | Schema Registry and Compatibility Evolution | Accepted | P2-P3 |
| ADR-023 | Workflow Execution Resiliency | Accepted | P0-P1 |
