import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const TENANT_SUSPENDED = 'tenant.suspended';

export interface TenantSuspendedPayload {
  readonly organizationId: string;
  readonly reason: string;
  readonly suspendedBy: string;
  readonly suspendedAt: string;
}

export type TenantSuspendedEvent = EventEnvelope<TenantSuspendedPayload>;
