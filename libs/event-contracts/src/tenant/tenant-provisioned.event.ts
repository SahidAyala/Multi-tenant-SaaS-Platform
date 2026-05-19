import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const TENANT_PROVISIONED = 'tenant.provisioned';

export interface TenantProvisionedPayload {
  readonly organizationId: string;
  readonly provisionedAt: string;
  readonly defaultProjectId: string;
  readonly resourcesCreated: string[];
}

export type TenantProvisionedEvent = EventEnvelope<TenantProvisionedPayload>;
