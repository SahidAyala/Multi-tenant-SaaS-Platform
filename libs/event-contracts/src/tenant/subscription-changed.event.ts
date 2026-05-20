import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const SUBSCRIPTION_CHANGED = 'tenant.subscription.changed';

export interface SubscriptionChangedPayload {
  readonly organizationId: string;
  readonly previousPlan: string;
  readonly newPlan: string;
  readonly changeReason: 'upgrade' | 'downgrade' | 'renewal' | 'cancellation' | 'trial_start';
  readonly effectiveAt: string;
}

export type SubscriptionChangedEvent = EventEnvelope<SubscriptionChangedPayload>;
