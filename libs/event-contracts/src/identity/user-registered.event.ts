import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const USER_REGISTERED = 'identity.user.registered';

export interface UserRegisteredPayload {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly registeredAt: string;
}

export type UserRegisteredEvent = EventEnvelope<UserRegisteredPayload>;
