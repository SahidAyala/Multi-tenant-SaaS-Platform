import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const USER_INVITED = 'identity.user.invited';

export interface UserInvitedPayload {
  readonly inviteeEmail: string;
  readonly inviterId: string;
  readonly organizationId: string;
  readonly role: string;
  readonly invitationToken: string;
  readonly expiresAt: string;
}

export type UserInvitedEvent = EventEnvelope<UserInvitedPayload>;
