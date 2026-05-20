import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const RBAC_VIOLATION_DETECTED = 'identity.rbac.violation';

export interface RBACViolationDetectedPayload {
  readonly userId: string;
  readonly requiredPermission: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly ipAddress?: string;
}

export type RBACViolationDetectedEvent = EventEnvelope<RBACViolationDetectedPayload>;
