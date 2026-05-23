# ADR-018: Kafka Partitioning, Ordering Guarantees, and Consumer Scaling

**Status:** Accepted  
**Date:** 2026-05-22  
**Deciders:** Engineering

---

## Context

The current Kafka configuration uses 6 partitions (`KAFKA_TOPIC_PARTITIONS=6`) with a `Hash` balancer keyed on `StreamID`. This is a reasonable starting point but has several unresolved problems that will cause production failures as throughput grows:

### Current Behaviour

- **Single topic `events.v1`** with 6 partitions (configurable but default is set at startup and cannot be decreased without topic recreation).
- **Partition key:** `stream_id` via `&kafkago.Hash{}`. All events for `order:1` land on the same partition in the same order — this is correct.
- **Consumer group:** Single group `consumer-service` runs the Elasticsearch indexer.
- **Workflow Engine:** Second consumer group consuming the same topic, single goroutine.
- **Replication factor:** 1 (dev default) — no fault tolerance in production.

### Problems That Will Manifest

1. **Hot partitions.** If `stream_id` values are not uniformly distributed (e.g., all orders cluster in prefix `order:*`), a small number of partitions receive all writes while others sit idle. A single hot partition becomes a throughput ceiling.

2. **Ordering guarantee is weaker than assumed.** The current design guarantees per-stream ordering within a partition. But it does NOT guarantee that events from different streams on the same partition are seen by different consumers in any particular interleaving. If a consumer crashes mid-partition, reprocessing starts from the last committed offset — re-processing all streams in that partition, not just the failing one.

3. **Consumer parallelism is limited by partition count.** With 6 partitions and a consumer group of N instances, at most 6 instances are active. The 7th instance is idle. Scaling beyond 6 instances for the indexer requires increasing partitions — but increasing partitions on an existing topic re-distributes keys, potentially breaking per-stream ordering during the transition.

4. **Replication factor = 1 means data loss.** A single broker failure loses all messages in-flight. In production, replication must be ≥ 3 with `min.insync.replicas = 2`.

5. **The Workflow Engine shares the same topic without isolation.** The Workflow Engine's consumer group reads the entire `events.v1` topic. It processes every event (looking for trigger matches) even though it only cares about a small subset. This wastes CPU and creates unnecessary coupling between the indexer and the workflow trigger path.

6. **No consumer lag monitoring.** There is no mechanism to detect when any consumer group falls behind. A slow indexer or crashing Workflow Engine consumer could silently accumulate unbounded lag.

---

## Decision

### 1. Partitioning Key Strategy

Keep `stream_id` as the partition key. This is the correct choice: it preserves per-stream event ordering, which is the core invariant of the event store (events within a stream must be processed in version order). Do NOT change to tenant-scoped keys because that would mix streams across tenants onto the same partition, creating cross-tenant coupling.

**Enhance partition key for hot-stream mitigation:** When a stream is known to be high-throughput (e.g., a global `system:audit` stream), the producer should append a shard suffix. Example: `order:1#shard0`, `order:1#shard1`. The shard suffix distributes load while the consumer reassembles. This is opt-in and not needed at current scale.

### 2. Partition Count

Set **24 partitions** for the main events topic in production:
- Allows up to 24 parallel consumers per group
- Provides headroom for 4x growth without partition increase
- 24 is divisible by 2, 3, 4, 6, 8, 12 — gives flexible deployment options

**Never decrease partition count** on a live topic (breaks ordering). To increase: add partitions, then perform a rolling restart of all consumers to pick up the new assignment.

### 3. Replication Factor

`min_insync_replicas = 2`, `replication_factor = 3` for all production topics. The producer uses `RequireOne` acknowledgement (current) for the write path — acceptable because events are first written to PostgreSQL. Kafka is best-effort. Changing to `RequireAll` would block ingestion during a broker failure, which violates the durability model (PostgreSQL is the source of truth).

### 4. Consumer Group Isolation

Introduce a **separate consumer group per logical consumer type:**

| Consumer Group | Service | Purpose |
|---|---|---|
| `es-indexer-v1` | Event Streaming consumer-service | Index to Elasticsearch |
| `wf-trigger-v1` | Workflow Engine | Dispatch workflow runs |
| `audit-archive-v1` | Future archival service | Cold storage archival |

Each group maintains independent offsets. The Elasticsearch indexer falling behind does NOT affect the Workflow Engine trigger latency.

**Naming convention:** Include a version suffix (`-v1`). When a breaking consumer logic change requires replaying from the beginning, create a new group (`-v2`) at earliest offset, let it catch up, then decommission `-v1`. This avoids re-processing race conditions.

### 5. Topic Routing (Current Domain Routing Is Correct)

The `PrefixTopicResolver` already supports domain-based routing via `KAFKA_TOPIC_ROUTES`. This is the escape hatch for creating a separate topic per domain:

```
KAFKA_TOPIC_ROUTES=order:events.order.v1,user:events.user.v1
```

**Adopt this for high-volume domains when:** any single domain exceeds 30% of total event throughput. Start with single-topic, graduate to per-domain topics when load requires.

### 6. Required Acks and Idempotent Producer

Enable Kafka **idempotent producer** to prevent duplicate messages during retries:
```go
writer.Async = false
writer.RequiredAcks = kafkago.RequireOne  // keep — PG is source of truth
// Add: idempotent producer prevents duplicates on network retry
```

Note: segmentio/kafka-go enables idempotent producer by setting `RequiredAcks = RequireAll`. We keep `RequireOne` for latency reasons since PG is durable, but we will document that duplicate Kafka messages are possible (consumers must be idempotent).

### 7. Consumer Scaling

Each consumer group can scale independently:
- Elasticsearch indexer: scale to partition count (max 24)
- Workflow trigger: scale to partition count — but enforce per-instance DB connection limits
- Add instance count to `KafkaConfig` — operator sets `KAFKA_CONSUMER_CONCURRENCY` to control goroutine pool per instance

---

## Migration Strategy

1. **Phase 1 (now):** Set `KAFKA_TOPIC_REPLICATION=3` in production. Change `KAFKA_TOPIC_PARTITIONS=24` for new deployments. Existing topics cannot have partitions decreased; recreate topic in maintenance window if needed.

2. **Phase 2:** Rename consumer groups by adding `-v1` suffix. Old group IDs become orphaned (will stop receiving messages after restart). Create new topics with the correct partition count before consumer restart.

3. **Phase 3:** When a high-volume domain emerges, enable `KAFKA_TOPIC_ROUTES` to route it to a dedicated topic. Add the new topic to all consumer groups that need it.

---

## Observability Implications

- **Consumer lag** must be monitored per group per partition. Alert when lag > 10,000 messages or lag growth rate > 500 messages/minute.
- **Partition imbalance** (one partition >> others in message count) signals a hot partition. Log per-partition metrics at the producer.
- **Rebalance events** cause processing gaps. Log each rebalance with duration and partitions reassigned.

---

## Tradeoffs

| Option | Pro | Con |
|---|---|---|
| Keep 6 partitions | No migration cost | Hard ceiling at 6 concurrent consumers |
| 24 partitions | 4x headroom, flexible scaling | Must recreate topic or perform partition increase with rebalance risk |
| Per-tenant topic | Perfect tenant isolation | Operationally explosive at scale (1 topic per tenant) |
| Per-domain topic | Lower per-topic volume | More consumer group management, higher broker overhead |

---

## Operational Risks

- Increasing partitions on a live topic causes a consumer group rebalance; brief processing pause (seconds). Schedule during low-traffic window.
- Creating a new consumer group on an existing topic defaults to `latest` offset. If historical reprocessing is needed, explicitly set `StartOffset = kafkago.FirstOffset` before first run.
- Group ID change requires explicit `StartOffset` setting — forgetting this loses all historical events for that consumer.
