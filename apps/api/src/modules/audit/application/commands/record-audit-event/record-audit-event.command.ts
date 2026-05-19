import { Command } from '@atlas/shared-kernel';
import { AuditActorType, AuditOutcome } from '../../../domain/entities/audit-event.entity';

export class RecordAuditEventCommand extends Command {
  readonly actorId?: string;
  readonly actorType: AuditActorType;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly outcome: AuditOutcome;
  readonly metadata: Record<string, unknown>;
  readonly ipAddress?: string;
  readonly userAgent?: string;

  constructor(params: {
    tenantId: string;
    correlationId: string;
    actorId?: string;
    actorType?: AuditActorType;
    action: string;
    resourceType: string;
    resourceId: string;
    outcome?: AuditOutcome;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
    userAgent?: string;
  }) {
    super({ tenantId: params.tenantId, correlationId: params.correlationId, actorId: params.actorId });
    this.actorId = params.actorId;
    this.actorType = params.actorType ?? 'system';
    this.action = params.action;
    this.resourceType = params.resourceType;
    this.resourceId = params.resourceId;
    this.outcome = params.outcome ?? 'success';
    this.metadata = params.metadata ?? {};
    this.ipAddress = params.ipAddress;
    this.userAgent = params.userAgent;
  }
}
