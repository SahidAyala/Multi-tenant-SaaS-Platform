/**
 * Canonical envelope for all cross-boundary platform events.
 *
 * Every event crossing a domain or service boundary MUST implement this
 * interface. All fields are carried through the full lifecycle:
 *   SaaS Platform → outbox → Event Streaming → Kafka → Workflow Engine
 *
 * Field semantics (identity and causation):
 *   eventId        — globally unique UUID for this event instance (idempotency key)
 *   eventType      — dot-notation type string (e.g. "tenant.created")
 *   eventVersion   — schema/contract version of this event type (e.g. 1, 2).
 *                    DISTINCT from the stream version assigned by Event Streaming
 *                    (which is a monotonic sequence number per stream). Increment
 *                    this when the payload shape changes in a breaking way.
 *   tenantId       — tenant this event belongs to (multi-tenancy scope)
 *   correlationId  — request-scoped trace ID; never changes across a causal chain
 *   actorId        — who triggered the action (user ID, "system", service name)
 *   causationId    — eventId of the event that directly caused this one; set when
 *                    an event is produced as a reaction to another event (e.g. a
 *                    workflow triggered by tenant.created sets causationId to the
 *                    tenant.created eventId)
 *   traceId        — W3C distributed trace ID (32 hex chars, no dashes); extracted
 *                    from the `traceparent` HTTP header when present. Maps directly
 *                    to an OpenTelemetry trace ID when OTel is adopted (ADR-014).
 *   sourceService  — name of the service that produced this event
 *   sourceVersion  — semantic version of sourceService at time of emission (e.g. "1.4.2")
 *   occurredAt     — ISO-8601 UTC timestamp when the domain event occurred
 *   payload        — event-type-specific data
 *
 * Field semantics (replay — only set on events created by POST /replay):
 *   isReplay              — true when this is a replay of a previous event
 *   replayId              — UUID identifying the replay batch; groups all events
 *                           replayed together in a single POST /replay call
 *   replayedAt            — ISO-8601 UTC when the replay was initiated
 *   replayReason          — human-readable reason for the replay (required when isReplay=true)
 *   replaySourceEventId   — eventId of the original event this was replayed from;
 *                           follow this chain to reach the root original event
 *
 * See ADR-014 (distributed tracing), ADR-015 (replay architecture).
 */
export interface TenantAwareEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly eventVersion: number;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly actorId?: string;
  readonly causationId?: string;
  readonly traceId?: string;
  readonly sourceService: string;
  readonly sourceVersion?: string;
  readonly occurredAt: string; // ISO-8601
  readonly payload: Record<string, unknown>;

  // Replay metadata — only present on events created by POST /replay (ADR-015).
  // Absent on original events; consumers must handle absence gracefully.
  readonly isReplay?: boolean;
  readonly replayId?: string;
  readonly replayedAt?: string;         // ISO-8601
  readonly replayReason?: string;
  readonly replaySourceEventId?: string;
}

export type EventEnvelope<T extends Record<string, unknown> = Record<string, unknown>> =
  TenantAwareEvent & { readonly payload: T };
