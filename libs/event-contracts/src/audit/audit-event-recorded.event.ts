import { EventEnvelope } from '../base/tenant-aware-event.interface';

export const AUDIT_EVENT_RECORDED = 'audit.event.recorded';

export interface AuditEventRecordedPayload {
  readonly auditEventId: string;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly outcome: 'success' | 'failure';
  readonly metadata: Record<string, unknown>;
}

export type AuditEventRecordedEvent = EventEnvelope<AuditEventRecordedPayload>;
