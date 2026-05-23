# ADR-023: Workflow Execution Resiliency Under Partial Failures

**Status:** Accepted  
**Date:** 2026-05-22  
**Deciders:** Engineering

---

## Context

The Workflow Engine executes multi-step workflows (HTTP requests, delays, conditionals) against external systems. Partial failures are inherent: an external endpoint may be unreachable, a step may time out mid-execution, or the executor process itself may crash while a step is running.

The current implementation has the correct data model for resiliency (step_runs with status tracking, retry logic, idempotency records) but several critical gaps that will cause duplicate execution, silent failures, and partition stalls at scale.

### Current Critical Gaps

1. **No pessimistic lock on step claim.** `GetNextPendingStepRun` uses `LIMIT 1` without `FOR UPDATE SKIP LOCKED`. Multiple executor instances can claim the same step simultaneously, causing duplicate execution.

2. **Fixed poll interval with no jitter.** All executor instances poll exactly every 1 second. At 10 instances, this produces 10 simultaneous DB queries per second at exactly :00, :01, etc. This is a thundering herd pattern.

3. **Kafka consumer retries are immediate.** The WF consumer retries a failed handler 3 times in <10ms then dead-letters. A transient DB connection error (which typically resolves in 50-500ms) will never recover under this policy — the message is always dead-lettered.

4. **No workflow-level timeout.** A stuck HTTP step (waiting for an external service that never responds) blocks forever. There is no mechanism to fail a workflow run after a configured maximum duration.

5. **No visibility into stuck runs.** A workflow_run with status=`running` for >24 hours is likely stuck. There is no detection or alerting.

---

## Decision

### 1. Claim Step Run with `FOR UPDATE SKIP LOCKED`

The `GetNextPendingStepRun` query must use `FOR UPDATE SKIP LOCKED` to prevent concurrent claims. This is the standard PostgreSQL pattern for distributed job queues.

```sql
SELECT id, workflow_run_id, workflow_step_id, attempt, ...
FROM step_runs
WHERE status = 'pending'
  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
ORDER BY created_at ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;
```

`SKIP LOCKED` means: "skip any rows that are currently locked by another transaction." This allows multiple executor instances to run without blocking each other, while guaranteeing each step is claimed by exactly one executor.

**Atomicity requirement:** The claim must be combined with the status update in a single transaction:
```sql
BEGIN;
SELECT id, ... FROM step_runs WHERE status = 'pending' ... FOR UPDATE SKIP LOCKED;
UPDATE step_runs SET status = 'running', updated_at = NOW() WHERE id = $1;
COMMIT;
```

If the executor crashes after claiming but before completing, the `running` status persists. A separate watchdog query detects and resets stale running steps (see §4).

### 2. Executor Poll Jitter

Add ±500ms uniform jitter to the executor poll interval. This staggers 10 instances across a 1-second window instead of all hitting at once:

```go
const (
    pollIntervalBase = 1 * time.Second
    pollJitter       = 500 * time.Millisecond
)

func nextPollDelay() time.Duration {
    jitter := time.Duration(rand.Int63n(int64(pollJitter)))
    return pollIntervalBase + jitter
}
```

**Additionally:** When `GetNextPendingStepRun` returns nil (no work available), back off exponentially up to 30 seconds. This reduces database polling load during quiet periods. Reset to base interval immediately when a step is found.

```go
backoff := exponentialBackoff{min: 1*time.Second, max: 30*time.Second, factor: 1.5}
if next == nil {
    time.Sleep(backoff.Next())
} else {
    backoff.Reset()
}
```

### 3. Kafka Consumer Retry with Exponential Backoff

The current `maxHandlerRetries=3` with immediate retries is too aggressive for transient failures. Replace with exponential backoff between attempts:

```go
const (
    maxHandlerRetries = 5
    retryBaseDelay    = 100 * time.Millisecond
    retryMaxDelay     = 5 * time.Second
)

for attempt := 1; attempt <= maxHandlerRetries; attempt++ {
    handlerErr = c.handler(msgCtx, &event)
    if handlerErr == nil {
        break
    }
    if isNonRetriable(handlerErr) {
        break
    }
    delay := min(retryBaseDelay * (1 << attempt), retryMaxDelay)
    delay += jitter(delay, 0.2) // ±20% jitter
    select {
    case <-time.After(delay):
    case <-ctx.Done():
        return ctx.Err()
    }
}
```

Total retry window: ~100ms + 200ms + 400ms + 800ms + 1600ms ≈ 3.1 seconds for a 5-attempt sequence. This covers most transient database connection errors while not stalling the partition for too long.

### 4. Stale Running Step Watchdog

If an executor crashes while a step is `running`, the step is stuck forever. Add a scheduled watchdog that detects and resets stale running steps:

```sql
UPDATE step_runs
SET status = 'pending',
    next_retry_at = NOW(),
    last_error = 'reset by watchdog: running for > 10 minutes without completion'
WHERE status = 'running'
  AND updated_at < NOW() - INTERVAL '10 minutes';
```

Run this query every 60 seconds in a background goroutine (not the executor loop). The threshold (10 minutes) must be greater than the maximum expected step execution time.

**For workflows with long-running HTTP steps:** The `step_config.timeout_seconds` field defines the maximum execution time. The watchdog threshold should be `MAX(10 minutes, max configured step timeout + 2 minutes)`.

### 5. Workflow Run Timeout

Add `timeout_at TIMESTAMPTZ` to `workflow_runs`. A workflow whose `timeout_at < NOW()` with status `running` is marked `failed` by the watchdog.

Default timeout: 24 hours (configurable per workflow definition via `max_duration_seconds`).

```sql
ALTER TABLE workflow_runs ADD COLUMN timeout_at TIMESTAMPTZ;

-- Set on run creation:
INSERT INTO workflow_runs (..., timeout_at)
VALUES (..., NOW() + make_interval(secs => $timeout_seconds));
```

The watchdog query:
```sql
UPDATE workflow_runs
SET status = 'failed',
    error_message = 'workflow run exceeded maximum duration',
    completed_at = NOW()
WHERE status IN ('pending', 'running')
  AND timeout_at < NOW();
```

### 6. Circuit Breaker on Event Publishing (HTTPClient)

The `eventstore.HTTPClient` used to publish workflow lifecycle events has no circuit breaker. Under a prolonged Event Streaming outage, every step completion blocks for 5 seconds (HTTP timeout), then fails and logs an error.

**Decision:** Wrap the `HTTPClient.Publish()` call in a circuit breaker:
- Closed → Open: 5 consecutive failures within 30 seconds
- Open → Half-Open probe: after 60 seconds
- Half-Open → Closed: first probe succeeds

During the open state, `Publish()` returns immediately with a `circuit_open` error. The executor logs a warning but does NOT fail the step run — event publishing is best-effort (the workflow executed successfully; the lifecycle event is cosmetic).

### 7. Idempotency Record Cleanup

The `processed_integration_events` table records every Kafka message that has been successfully handled to prevent duplicate workflow runs. This table will grow indefinitely.

Add a retention policy:
```sql
-- Delete processed events older than 30 days (same as Kafka retention)
DELETE FROM processed_integration_events
WHERE processed_at < NOW() - INTERVAL '30 days';
```

Run as a daily background job. After 30 days, an event that arrives again is almost certainly a replay (intentional or due to a consumer reset), not an at-least-once duplicate.

---

## What We Are NOT Doing

- **Not implementing a distributed lock via Redis.** `FOR UPDATE SKIP LOCKED` is sufficient for PostgreSQL-based job queues at this scale. Redis adds infrastructure complexity; PostgreSQL already handles the locking correctly.
- **Not building a Saga coordinator.** The current workflow model (sequential steps, retry-per-step) is sufficient. Saga patterns (compensation transactions, distributed rollback) are needed only when steps span multiple external databases. Add when required.
- **Not using Temporal or similar workflow orchestration frameworks.** This would require migrating the entire data model. Revisit if workflow complexity grows significantly (parallel steps, dynamic branching, sub-workflows).

---

## Migration Strategy

1. **This sprint — CRITICAL:** Add `FOR UPDATE SKIP LOCKED` to `GetNextPendingStepRun`. This is a data safety fix, not a feature. A single-line SQL change.
2. **This sprint:** Add poll jitter to executor.
3. **Next sprint:** Add Kafka consumer exponential backoff.
4. **Next sprint:** Add workflow_run `timeout_at` column + watchdog.
5. **Month 2:** Circuit breaker on HTTPClient, idempotency record cleanup job.

---

## Observability Implications

- `workflow_runs_stuck_total` (watchdog resets) — alert if > 5/hour
- `workflow_run_timeout_total` — alert if > 0/hour (investigate why runs are timing out)
- `executor_claim_conflicts_total` (if SKIP LOCKED discards rows) — measure contention level
- `kafka_consumer_retry_total{attempt}` — histogram showing retry distribution
- `circuit_breaker_state{service}` gauge — 0=closed, 1=open, 2=half-open

---

## Tradeoffs

| Approach | Pro | Con |
|---|---|---|
| `FOR UPDATE SKIP LOCKED` | Standard PostgreSQL, no new infra | Only works with PostgreSQL; not portable |
| Redis SETNX distributed lock | Language-agnostic, works across services | New infrastructure; Redis failure = executor halted |
| Outbox pattern for step claims | Guaranteed at-least-once | More complex data model, more tables |
| Exactly-once via idempotency | No duplicates | Requires consistent idempotency key across retries |

**Chosen:** `FOR UPDATE SKIP LOCKED` + existing idempotency records. This is the operationally simplest solution that solves the problem at this scale.
