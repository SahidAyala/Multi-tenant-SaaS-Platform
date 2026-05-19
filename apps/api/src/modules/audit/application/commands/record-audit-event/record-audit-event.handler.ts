import { Inject, Injectable, Logger } from '@nestjs/common';
import { Result } from '@atlas/shared-kernel';
import { AUDIT_EVENT_RECORDED, AuditEventRecordedEvent } from '@atlas/event-contracts';
import { RecordAuditEventCommand } from './record-audit-event.command';
import {
  AUDIT_EVENT_REPOSITORY,
  AuditEventRepositoryPort,
} from '../../../domain/repositories/audit-event.repository.port';
import { AuditEventEntity } from '../../../domain/entities/audit-event.entity';
import { EVENT_BUS_PORT, IEventBus } from '../../../../platform-events/ports/event-bus.port';

@Injectable()
export class RecordAuditEventHandler {
  private readonly logger = new Logger(RecordAuditEventHandler.name);

  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepository: AuditEventRepositoryPort,
    @Inject(EVENT_BUS_PORT)
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
      version: 1,
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
