/**
 * Canonical contract for all platform events.
 * Every event crossing a domain boundary MUST implement this.
 *
 * The envelope fields (tenantId, correlationId, etc.) are required for:
 *  - Audit trail reconstruction
 *  - Multi-tenant event routing
 *  - Distributed tracing correlation
 *  - Event replay and forensics
 */
export interface TenantAwareEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly actorId?: string;
  readonly causationId?: string;
  readonly occurredAt: string; // ISO-8601
  readonly version: number;
  readonly payload: Record<string, unknown>;
}

export type EventEnvelope<T extends Record<string, unknown> = Record<string, unknown>> =
  TenantAwareEvent & { readonly payload: T };
