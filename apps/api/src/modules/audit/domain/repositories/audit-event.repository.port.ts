import { PaginatedResult, PaginationOptions } from '@atlas/shared-kernel';
import { AuditEventEntity } from '../entities/audit-event.entity';

export interface AuditEventFilter {
  actorId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: 'success' | 'failure';
  fromDate?: Date;
  toDate?: Date;
}

export abstract class AuditEventRepositoryPort {
  abstract append(event: AuditEventEntity): Promise<AuditEventEntity>;
  abstract appendBatch(events: AuditEventEntity[]): Promise<void>;
  abstract findById(id: string): Promise<AuditEventEntity | null>;
  abstract query(filter: AuditEventFilter, options?: PaginationOptions): Promise<PaginatedResult<AuditEventEntity>>;
}
