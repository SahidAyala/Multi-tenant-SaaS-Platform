# ADR-003: Redis Streams as Internal Event Bus

**Date:** 2026-05-18  
**Status:** Accepted  
**Deciders:** Platform Engineering

---

## Context

Internal domain events need to be delivered across bounded contexts without tight coupling. Options considered:

| Option | Pros | Cons |
|--------|------|------|
| Synchronous NestJS EventEmitter | Simple, in-process | No persistence, single-process, no replay |
| Kafka | At-least-once, partitioned, replay | Heavy operational burden, overkill initially |
| NATS JetStream | Lightweight, persistent, cloud-native | New dependency, less familiar |
| Redis Streams | Persistent, consumer groups, already in stack | Single-node risk without Redis Cluster |
| RabbitMQ | Mature, flexible routing | Additional operational dependency |

## Decision

Use **Redis Streams** for the production event bus, with an **InMemoryEventBus** for local development and testing.

The `IEventBus` port abstracts the transport. Application code never imports Redis directly.

### Stream naming convention
```
atlas:events:{eventType}
# e.g. atlas:events:tenant.created
#      atlas:events:audit.event.recorded
```

### Consumer group strategy
- Group: `atlas-api` — all monolith handlers
- When extracting a service: add new consumer group (e.g., `atlas-workflow-engine`)
- Each consumer group receives all messages independently (fan-out)

### Delivery guarantees
- At-least-once delivery (XACK after successful processing)
- Dead-letter stream: `atlas:events:dlq`
- MAXLEN trim to prevent unbounded growth (configurable, default 10K per stream)

## Consequences

**Positive:**
- Redis already required for sessions/cache — no new operational dependency
- Persistent: events survive process restart
- Consumer groups: independent consumption per service
- Built-in backpressure and replay via stream IDs

**Negative:**
- Single Redis node is a SPOF (mitigate with Redis Sentinel or Cluster in production)
- Not as battle-tested for high-throughput event streaming as Kafka
- MAXLEN trim means events are not retained indefinitely (use audit table for compliance)

## Extraction Path to NATS/Kafka

The `IEventBus` interface is the only surface. Swapping adapters:
1. Implement `NatsJetStreamEventBus implements IEventBus`
2. Change `EVENT_BUS_ADAPTER=nats` in environment config
3. The `PlatformEventsModule.forRoot()` factory selects the implementation

No domain or application code changes.
