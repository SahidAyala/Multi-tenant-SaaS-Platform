# ADR-019: Backpressure, Rate Limiting, and Graceful Degradation

**Status:** Accepted  
**Date:** 2026-05-22  
**Deciders:** Engineering

---

## Context

The current system has no mechanism to slow down producers when consumers are falling behind. It also has no mechanism to protect PostgreSQL or Kafka from burst writes. Under sustained load, any of these failure modes will occur:

1. **Ingest API saturates PostgreSQL** under burst writes, causing cascading lock timeouts that propagate back to callers as 500 errors.
2. **Kafka consumer accumulates unbounded lag** — the indexer can't keep up, Elasticsearch falls further behind, and read queries return increasingly stale data.
3. **Outbox processor in NestJS hammers the Event Streaming API** during a transient outage — 50 requests/5s × retries per batch = thundering herd that makes the outage worse.
4. **Workflow executor flood** — when a large replay batch re-publishes thousands of events, the workflow trigger consumer fires thousands of workflow runs simultaneously, overwhelming the PostgreSQL step_runs table.

None of these are theoretical. All will occur under:
- A marketing campaign or on-call incident causing event spike
- A new tenant onboarding with a large historical backfill
- A replay operation targeting 1000+ events
- A consumer crash that accumulates lag and then restarts at speed

---

## Decision

### 1. Ingest API: Per-Tenant Rate Limiting

Add per-tenant rate limiting at the HTTP layer using a token bucket algorithm:
- Default: 1000 events/minute per tenant (configurable via `RATE_LIMIT_EVENTS_PER_MINUTE`)
- Burst: allow up to 200 events in a 10-second window before throttling
- Response: `HTTP 429 Too Many Requests` with `Retry-After` header
- The rate limiter state is in-memory per instance. For multi-instance deployments, use Redis as the shared token bucket store.

**Why token bucket over fixed window:** Token bucket handles burst traffic gracefully — a tenant that hasn't sent events for 10 minutes can send a burst of 10,000/60 × 10 = 1,666 events instantly, which is safe. Fixed window is vulnerable to boundary bursts (0 events in first 59s, 2000 in last 1s of a minute window).

Implementation: `golang.org/x/time/rate` for single-instance, `redis-rate` library for distributed rate limiting.

### 2. PostgreSQL Connection Pool: Hard Limits

The current `pgxpool` configuration uses unlimited connections by default. This will exhaust `max_connections` on the database server.

Set explicit limits in `PostgresConfig`:
```
POSTGRES_POOL_MAX=20          # per process
POSTGRES_POOL_MIN=2           # keep-alive minimum
POSTGRES_POOL_MAX_IDLE_TIME=5m # return idle connections to OS
```

For the ingest-api, `max=20` means the API server can have up to 20 concurrent DB operations. Any request that cannot acquire a connection within 2 seconds returns `HTTP 503 Service Unavailable` with a `Retry-After: 2` header.

This is intentional backpressure: it is better to reject 1% of requests explicitly than to let all requests time out silently at 30 seconds.

### 3. Kafka Producer: Non-Blocking Publish with Circuit Breaker

The current producer blocks for up to `WriteTimeout = 10s` on every publish. Under a Kafka outage, every ingest request holds a goroutine for 10 seconds, exhausting the HTTP server's thread pool.

**Decision:** Convert Kafka publish to non-blocking within the ingest path:
1. Ingest to PostgreSQL (synchronous — this is the durable write).
2. Publish to Kafka with a **short timeout (500ms)**.
3. If publish fails: log a warning, emit a metric (`kafka_publish_failures_total`), and return success to the caller. The event is durable in PostgreSQL. A background reconciler will detect and re-publish missed events.

**Circuit breaker on the producer:** After 5 consecutive publish failures, open the circuit for 30 seconds. During the open state, skip Kafka publish entirely (PostgreSQL write still succeeds). Reclose after a probe message succeeds. This prevents the 10s × N goroutines pile-up.

### 4. Kafka Consumer: Backpressure via Semaphore

The consumer currently processes one message at a time sequentially. This is safe but limits throughput to `1 / message_processing_latency`. The alternative (unbounded goroutines) is dangerous.

**Decision:** Add a bounded worker pool with configurable concurrency:

```
CONSUMER_WORKER_COUNT=4  # goroutines per consumer instance
```

The consumer fetches a batch of `CONSUMER_WORKER_COUNT` messages, dispatches them to the pool, and only fetches the next batch when all workers are free. This gives bounded parallelism while preserving per-partition ordering (goroutines within a batch process different partitions).

**Warning:** Per-partition ordering requires that messages from the same partition are processed sequentially. The bounded pool must dispatch messages from the same partition to the same goroutine. Use partition ID as the worker index: `worker = partition_id % CONSUMER_WORKER_COUNT`.

### 5. Outbox Processor: Exponential Backoff on Failures

The NestJS outbox processor polls every 5 seconds unconditionally. When Event Streaming is down:
- Attempt 1 fails → wait 5s → Attempt 2 fails → wait 5s … (hammering)

**Decision:** Implement adaptive poll interval:
- On success: reset to `POLL_INTERVAL_MS` (5000)
- On failure: double the interval, up to `MAX_POLL_INTERVAL_MS` (60000)
- Add ±20% jitter to prevent synchronized polling across instances

This reduces load on a recovering Event Streaming service by 12x compared to fixed polling.

### 6. Workflow Engine: Concurrency Limit on Trigger Dispatch

When a replay operation re-publishes 1000 events and all 1000 match a workflow trigger, 1000 `CreateWorkflowRunWithStepRuns` calls execute within seconds. This will deadlock PostgreSQL row locks.

**Decision:** Add a configurable concurrency limit to the workflow trigger handler:

```
WF_TRIGGER_MAX_CONCURRENT=10  # max simultaneous workflow run creations
```

Implement as a semaphore-guarded channel. Excess trigger events are queued in memory up to `WF_TRIGGER_QUEUE_DEPTH=500`. If the queue is full, the Kafka consumer pauses fetching (natural backpressure). Log a warning when the queue depth exceeds 80%.

### 7. Replay API: Async for Large Replays

The current `POST /replay` endpoint is synchronous — it blocks until all events are re-ingested and published. For 1000 events, this can take 30+ seconds and will hit the HTTP timeout.

**Decision:** Make replay asynchronous when `matched_count > REPLAY_SYNC_THRESHOLD` (default: 100):
- Synchronous replay (≤100 events): current behaviour, returns result inline.
- Asynchronous replay (>100 events): returns `HTTP 202 Accepted` with `{"replay_id": "..."}` immediately. A background goroutine performs the replay. A new endpoint `GET /replay/{replay_id}/status` returns progress.

This is a future milestone; document the threshold as an operator-tunable parameter.

---

## Migration Strategy

1. **Immediate:** Set PostgreSQL pool limits via env vars (no code change needed with pgxpool).
2. **Sprint 1:** Add per-tenant rate limiting middleware. Deploy to staging, validate with load test.
3. **Sprint 2:** Add circuit breaker to Kafka producer. Test by simulating broker unavailability.
4. **Sprint 3:** Add outbox exponential backoff. Deploy to staging before prod.
5. **Sprint 4:** Add Workflow Engine concurrency limit on trigger dispatch.
6. **Future:** Async replay, bounded consumer pool.

---

## Observability Implications

Every new backpressure mechanism must emit a metric:

| Mechanism | Metric | Alert Threshold |
|---|---|---|
| Rate limiter | `ingest_rate_limited_total` per tenant | > 100/min for any tenant |
| DB pool exhaustion | `postgres_pool_wait_duration_p99` | > 500ms |
| Kafka circuit open | `kafka_circuit_open` (gauge) | any opening |
| Consumer queue depth | `consumer_queue_depth` | > 80% of capacity |
| Outbox backoff level | `outbox_poll_interval_ms` | > 30000 |

---

## Tradeoffs

| Approach | Pro | Con |
|---|---|---|
| Reject at rate limiter | Protects all downstream | Caller must implement retry; user experience degrades |
| Queue and slow-drain | Transparent to caller | Unbounded memory growth if not capped |
| Circuit breaker only | Simple, transparent | Does not limit burst to the system itself |

**Chosen strategy:** Rate limit at entry + circuit break at exit + bounded internal queues. Defense in depth: each layer protects the next.

---

## Operational Risks

- Rate limit thresholds that are too low will impact legitimate traffic during events. Provide per-tenant override via admin API.
- Circuit breaker false-positives (network blip ≠ broker down) must be tuned. Use 5 consecutive failures over 10 seconds, not instantaneous.
- DB pool too small causes thundering rejection. Pool size must be validated against `max_connections` before deployment: `(pool_size × instance_count) < 80% × max_connections`.
