import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const ROLE_ASSIGNED = 'identity.role.assigned';

export interface RoleAssignedPayload {
  readonly userId: string;
  readonly organizationId: string;
  readonly role: string;
  readonly projectId?: string;
  readonly assignedBy: string;
}

export type RoleAssignedEvent = EventEnvelope<RoleAssignedPayload>;
