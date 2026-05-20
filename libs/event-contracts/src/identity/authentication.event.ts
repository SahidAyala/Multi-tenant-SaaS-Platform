import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const AUTHENTICATION_SUCCEEDED = 'identity.auth.succeeded';
export const AUTHENTICATION_FAILED = 'identity.auth.failed';

export interface AuthenticationSucceededPayload {
  readonly userId: string;
  readonly method: 'password' | 'api_key' | 'oauth' | 'sso';
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export interface AuthenticationFailedPayload {
  readonly attemptedIdentifier: string;
  readonly reason: 'invalid_credentials' | 'account_locked' | 'mfa_required' | 'token_expired';
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export type AuthenticationSucceededEvent = EventEnvelope<AuthenticationSucceededPayload>;
export type AuthenticationFailedEvent = EventEnvelope<AuthenticationFailedPayload>;
