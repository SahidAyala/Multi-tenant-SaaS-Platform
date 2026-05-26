import { Injectable, Logger } from '@nestjs/common';
import { Result } from '@atlas/shared-kernel';
import { AUDIT_EVENT_RECORDED, AuditEventRecordedEvent } from '@atlas/event-contracts';
import { RecordAuditEventCommand } from './record-audit-event.command';
import { AuditEventRepositoryPort } from '../../../domain/repositories/audit-event.repository.port';
import { AuditEventEntity } from '../../../domain/entities/audit-event.entity';
import { IEventBus } from '../../../../platform-events/ports/event-bus.port';

@Injectable()
export class RecordAuditEventHandler {
  private readonly logger = new Logger(RecordAuditEventHandler.name);

  constructor(
    private readonly auditRepository: AuditEventRepositoryPort,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: RecordAuditEventCommand): Promise<Result<string>> {
    const auditEvent = AuditEventEntity.create({
      tenantId: command.tenantId,
      actorId: command.actorId,
      actorType: command.actorType,
      action: command.action,
      resourceType: command.resourceType,
      resourceId: command.resourceId,
      outcome: command.outcome,
      metadata: command.metadata,
      correlationId: command.correlationId,
      ipAddress: command.ipAddress,
      userAgent: command.userAgent,
      occurredAt: new Date(),
    });

    const saved = await this.auditRepository.append(auditEvent);

    const integrationEvent: AuditEventRecordedEvent = {
      eventId: saved.auditEventId,
      eventType: AUDIT_EVENT_RECORDED,
      tenantId: saved.tenantId,
      correlationId: saved.correlationId,
      actorId: saved.actorId,
      occurredAt: saved.occurredAt.toISOString(),
      eventVersion: 1,
      sourceService: 'atlas-saas-platform',
      payload: {
        auditEventId: saved.auditEventId,
        action: saved.action,
        resourceType: saved.resourceType,
        resourceId: saved.resourceId,
        outcome: saved.outcome,
        metadata: saved.metadata,
      },
    };

    await this.eventBus.publish(integrationEvent);

    return Result.ok(saved.auditEventId);
  }
}
