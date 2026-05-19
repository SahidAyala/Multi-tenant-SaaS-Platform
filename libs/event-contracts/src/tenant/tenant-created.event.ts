import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const TENANT_CREATED = 'tenant.created';

export interface TenantCreatedPayload {
  readonly organizationId: string;
  readonly name: string;
  readonly slug: string;
  readonly plan: string;
  readonly ownerId: string;
}

export type TenantCreatedEvent = EventEnvelope<TenantCreatedPayload>;
