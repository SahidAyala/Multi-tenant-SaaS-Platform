import { Injectable, Logger } from '@nestjs/common';
import { NotFoundException, Result, isNil } from '@atlas/shared-kernel';
import { TENANT_SUSPENDED, TenantSuspendedEvent } from '@atlas/event-contracts';
import { SuspendOrganizationCommand } from './suspend-organization.command';
import { OrganizationRepositoryPort } from '../../../domain/repositories/organization.repository.port';
import { IEventBus } from '../../../../platform-events/ports/event-bus.port';
import { OrganizationDto } from '../../dtos/organization.dto';

@Injectable()
export class SuspendOrganizationHandler {
  private readonly logger = new Logger(SuspendOrganizationHandler.name);

  constructor(
    private readonly organizationRepository: OrganizationRepositoryPort,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: SuspendOrganizationCommand): Promise<Result<OrganizationDto>> {
    const organization = await this.organizationRepository.findById(command.organizationId);
    if (isNil(organization)) {
      return Result.fail(new NotFoundException('Organization', command.organizationId));
    }

    organization.suspend({
      reason: command.reason,
      suspendedBy: command.actorId ?? 'system',
      correlationId: command.correlationId,
    });

    const saved = await this.organizationRepository.save(organization);

    for (const domainEvent of saved.domainEvents) {
      const integrationEvent: TenantSuspendedEvent = {
        eventId: domainEvent.eventId,
        eventType: TENANT_SUSPENDED,
        eventVersion: domainEvent.eventVersion,
        tenantId: domainEvent.tenantId,
        correlationId: domainEvent.correlationId,
        actorId: domainEvent.actorId,
        causationId: domainEvent.causationId,
        traceId: domainEvent.traceId,
        sourceService: domainEvent.sourceService,
        sourceVersion: domainEvent.sourceVersion,
        occurredAt: domainEvent.occurredAt.toISOString(),
        payload: domainEvent.payload as TenantSuspendedEvent['payload'],
      };
      await this.eventBus.publish(integrationEvent);
    }

    saved.clearDomainEvents();
    this.logger.log(`Organization suspended: ${saved.organizationId}`);

    return Result.ok(OrganizationDto.fromAggregate(saved));
  }
}
