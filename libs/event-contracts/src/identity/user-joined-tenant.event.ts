import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const USER_JOINED_TENANT = 'identity.user.joined_tenant';

export interface UserJoinedTenantPayload {
  readonly userId: string;
  readonly email: string;
  readonly role: string;
  readonly invitedBy?: string;
}

export type UserJoinedTenantEvent = EventEnvelope<UserJoinedTenantPayload>;
