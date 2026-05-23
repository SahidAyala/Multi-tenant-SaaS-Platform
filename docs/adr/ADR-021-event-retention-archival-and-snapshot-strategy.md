# ADR-021: Event Retention, Archival, and Snapshot Strategy

**Status:** Accepted  
**Date:** 2026-05-22  
**Deciders:** Engineering

---

## Context

The current `events` table in PostgreSQL is a fully unbounded append-only table. There is no retention policy, no archival mechanism, and no snapshot capability. This creates three converging problems at scale:

### Problem 1: Unbounded Table Growth

At 10,000 events/day per tenant, with 100 tenants:
- 1,000,000 events/day
- 365,000,000 events/year
- At ~2KB per event row (payload + metadata + indexes): **~730 GB/year**

PostgreSQL at this scale requires table partitioning, expensive index maintenance, and vacuum pressure. Queries that scan the full table (timeline reconstruction, replay with broad filters) will degrade from milliseconds to seconds within 6 months.

### Problem 2: Stream Hydration Cost

Event sourcing systems replay events to rebuild state (e.g., current order status from all `order.created`, `order.item_added`, `order.shipped` events). For a stream with 50,000 events, rebuilding state requires scanning and replaying 50,000 rows. Without snapshots, this cost scales linearly with stream history length.

### Problem 3: Kafka Retention vs PostgreSQL Divergence

Kafka topic retention is time-based (e.g., 7 days by default). PostgreSQL retains forever. Over time, Kafka loses events that PostgreSQL still has, but there is no defined policy for when this divergence is acceptable and when it requires a replay. Without a formal archival policy, the operational question "can we recover this from Kafka or must we use the replay API?" has no answer.

---

## Decision

### 1. PostgreSQL Table Partitioning by Month

Partition the `events` table by `occurred_at` using PostgreSQL declarative range partitioning. Each month gets its own physical partition file.

**Benefits:**
- Queries with a time range filter (`WHERE occurred_at BETWEEN ...`) only scan relevant partitions (partition pruning)
- Archival = detach the oldest partition and export it, without a full table scan
- Partition drops are instant (no `DELETE` vacuum pressure)
- Each partition can have its own storage class (e.g., tablespace on cheaper disk)

**Partition naming:** `events_2026_04`, `events_2026_05`, etc.

**Implementation:**
```sql
-- Main table becomes a partitioned parent
CREATE TABLE events (
    id             UUID        NOT NULL,
    occurred_at    TIMESTAMPTZ NOT NULL,
    ...
    PRIMARY KEY (id, occurred_at)  -- partition key must be in PK
) PARTITION BY RANGE (occurred_at);

-- Monthly partitions created by the migration tool at the start of each month
CREATE TABLE events_2026_05
    PARTITION OF events
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
```

A background job (or startup code) creates the next month's partition 7 days before the month begins.

**Migration from unpartitioned table:** This requires a maintenance window or a progressive migration:
1. Create new partitioned table `events_v2`
2. Migrate rows in batches by `occurred_at` range (old → new table)
3. Atomic rename `events` → `events_v1_archive`, `events_v2` → `events`
4. Drop `events_v1_archive` after validation

This migration must be planned carefully. Using pg_partman simplifies ongoing partition management.

### 2. Kafka Retention Policy

Set Kafka retention to **30 days** for `events.v1` and domain-specific topics:

```
retention.ms=2592000000   # 30 days
retention.bytes=-1        # no size limit (time is the limiter)
```

**Rationale:** 30 days provides a recovery window for most operational incidents (outages, consumer crashes) without requiring PostgreSQL replay. After 30 days, recovery requires the Event Streaming replay API.

Document this SLA clearly: **"Events are guaranteed available in Kafka for 30 days from publication. After 30 days, use GET /replay or GET /events to access historical events."**

For the DLQ topic, use a longer retention (90 days) since DLQ messages represent actionable items:
```
# events.v1.dlq
retention.ms=7776000000   # 90 days
```

### 3. Cold Storage Archival (S3/GCS)

For compliance and cost reasons, events older than 90 days should be moved from PostgreSQL to cold storage.

**Archival pipeline:**
1. A scheduled job runs daily: `SELECT ... WHERE occurred_at < NOW() - INTERVAL '90 days'`
2. Writes events as Parquet files to S3/GCS, partitioned by `tenant_id/year/month/day`
3. Verifies the upload before deleting from PostgreSQL
4. Records the archival range in a `event_archive_log` table (so queries know where to look)

**Query routing:** When a query's time range falls partly or entirely in the archive window, the API must indicate this:
```json
{
  "events": [...],
  "note": "some events in this time range have been archived; use GET /archive for complete data"
}
```

The `GET /archive` endpoint is a future milestone. For now, operators can query S3 directly via Athena/BigQuery.

**Parquet schema** mirrors the `events` table exactly (all columns), ensuring no data is lost.

### 4. Stream Snapshots

A snapshot is a point-in-time materialization of all events in a stream up to version N. It allows stream hydration to start from the snapshot rather than version 1.

**Snapshot contract:**
```go
type Snapshot struct {
    ID        uuid.UUID
    StreamID  string
    TenantID  string
    Version   int64         // events up to and including this version are in the snapshot
    State     json.RawMessage
    CreatedAt time.Time
}
```

**When to snapshot:** This depends on the application using event sourcing. The Event Streaming backbone does NOT dictate snapshot policy — it provides the snapshot API, but callers decide when to create snapshots. Initial rules:
- When a stream reaches 10,000 events, the next hydration creates a snapshot automatically
- Manual snapshot creation via `POST /streams/{streamID}/snapshot`

**Snapshot storage:** A new `snapshots` table in PostgreSQL (NOT partitioned — snapshots are small and infrequently accessed):
```sql
CREATE TABLE snapshots (
    id          UUID        PRIMARY KEY,
    stream_id   TEXT        NOT NULL,
    tenant_id   TEXT        NOT NULL,
    version     BIGINT      NOT NULL,
    state       JSONB       NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (stream_id, version)
);
CREATE INDEX ON snapshots (stream_id, version DESC);
```

**Replay with snapshot:** `GET /streams/{streamID}/events?from_snapshot=true` — the API looks up the latest snapshot, returns its state, and then replays only events with version > snapshot.version.

**Important:** Snapshots do NOT replace events. Events remain the source of truth. Snapshots are a read optimization. Delete a snapshot without fear — the next hydration will be slower but correct.

### 5. Elasticsearch Index Lifecycle Management (ILM)

The Elasticsearch index also needs a retention strategy:
- **Hot phase (0-7 days):** Replicas=1, full indexing, all searches
- **Warm phase (7-30 days):** Move to lower-performance nodes, replicas=0, read-only
- **Cold phase (30-90 days):** Mounted from snapshot, searchable but slow
- **Delete phase (>90 days):** Delete from Elasticsearch (data is in S3 archival)

Configure via ILM policy `events-lifecycle`:
```json
{
  "policy": {
    "phases": {
      "hot":  {"actions": {"rollover": {"max_age": "7d"}}},
      "warm": {"min_age": "7d", "actions": {"readonly": {}}},
      "cold": {"min_age": "30d", "actions": {"freeze": {}}},
      "delete": {"min_age": "90d", "actions": {"delete": {}}}
    }
  }
}
```

---

## Migration Strategy

1. **Phase 1 (Month 1):** Implement Kafka retention policy (30 days). No code change — broker config only.
2. **Phase 2 (Month 2):** Implement ES ILM policy. Kubernetes job or manual operator action.
3. **Phase 3 (Month 3-4):** PostgreSQL table partitioning migration. Requires maintenance window; use pg_partman.
4. **Phase 4 (Month 5-6):** Implement archival pipeline (S3 export). Write archival job, validate, then enable.
5. **Phase 5 (Quarter 3):** Stream snapshot API. New endpoint, new table, optional feature.

---

## Observability Implications

- `events_table_size_bytes` (PostgreSQL metric): alert when > 500GB
- `oldest_event_age_days`: alert when approaching archival boundary without archival job having run
- `snapshot_count_per_stream`: identify streams that should be snapshotted
- `archival_job_last_success`: alert if archival hasn't run in 25 hours

---

## Tradeoffs

| Option | Pro | Con |
|---|---|---|
| PostgreSQL partitioning | Battle-tested, SQL standard | Complex migration, must maintain partition creation job |
| TimescaleDB | Automatic partitioning, hypertables, compression | External dependency; adds operational complexity |
| Pure S3/Parquet | Infinite scale, cheap | No real-time query capability; need Athena/BigQuery |
| ClickHouse for analytics | Columnar, 100x faster for aggregations | New infrastructure; replication from PostgreSQL needed |

**Chosen:** PostgreSQL partitioning + S3 archival for now. ClickHouse is worth revisiting at 1B+ events (see ADR-022 for projection strategy).

---

## Operational Risks

- **Missing a monthly partition creation** causes all writes to fail with a partition constraint error. The partition creation job must be monitored and have a 7-day lead time.
- **Archival job partial failure** may leave partial data in S3 without completing the PostgreSQL delete. The archival job must be idempotent and transactional.
- **Snapshots going stale** — if the application logic changes (new event types), old snapshots may produce incorrect state. Snapshot invalidation strategy: include a `schema_version` in the snapshot, reject snapshots where `schema_version` < current.
