import { PaginatedResult, PaginationOptions } from '@atlas/shared-kernel';
import { AuditEventEntity } from '../entities/audit-event.entity';

export const AUDIT_EVENT_REPOSITORY = Symbol('AUDIT_EVENT_REPOSITORY');

export interface AuditEventFilter {
  tenantId: string;
  actorId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: 'success' | 'failure';
  fromDate?: Date;
  toDate?: Date;
}

export interface AuditEventRepositoryPort {
  append(event: AuditEventEntity): Promise<AuditEventEntity>;
  appendBatch(events: AuditEventEntity[]): Promise<void>;
  findById(id: string, tenantId: string): Promise<AuditEventEntity | null>;
  query(filter: AuditEventFilter, options?: PaginationOptions): Promise<PaginatedResult<AuditEventEntity>>;
}
