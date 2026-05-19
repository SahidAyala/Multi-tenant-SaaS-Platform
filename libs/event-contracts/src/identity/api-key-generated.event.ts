import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const API_KEY_GENERATED = 'identity.apikey.generated';

export interface ApiKeyGeneratedPayload {
  readonly apiKeyId: string;
  readonly prefix: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly permissions: string[];
  readonly expiresAt?: string;
}

export type ApiKeyGeneratedEvent = EventEnvelope<ApiKeyGeneratedPayload>;
