import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConflictException, Result } from '@atlas/shared-kernel';
import { TENANT_CREATED, TenantCreatedEvent } from '@atlas/event-contracts';
import { CreateOrganizationCommand } from './create-organization.command';
import {
  ORGANIZATION_REPOSITORY,
  OrganizationRepositoryPort,
} from '../../repositories/organization.repository.port';
import { OrganizationAggregate } from '../../aggregates/organization.aggregate';
import { EVENT_BUS_PORT, IEventBus } from '../../../../platform-events/ports/event-bus.port';
import { OrganizationDto } from '../../dtos/organization.dto';
import { generateId } from '@atlas/shared-kernel';

@Injectable()
export class CreateOrganizationHandler {
  private readonly logger = new Logger(CreateOrganizationHandler.name);

  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepositoryPort,
    @Inject(EVENT_BUS_PORT)
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: CreateOrganizationCommand): Promise<Result<OrganizationDto>> {
    const slugExists = await this.organizationRepository.existsBySlug(command.slug);
    if (slugExists) {
      return Result.fail(
        new ConflictException(`Organization with slug '${command.slug}' already exists`),
      );
    }

    const organization = OrganizationAggregate.create({
      name: command.name,
      slug: command.slug,
      planTier: command.planTier,
      ownerId: command.actorId ?? generateId(),
      correlationId: command.correlationId,
    });

    const saved = await this.organizationRepository.save(organization);

    // Publish integration events from domain events
    for (const domainEvent of saved.domainEvents) {
      const integrationEvent: TenantCreatedEvent = {
        eventId: domainEvent.eventId,
        eventType: TENANT_CREATED,
        tenantId: domainEvent.tenantId,
        correlationId: domainEvent.correlationId,
        actorId: domainEvent.actorId,
        occurredAt: domainEvent.occurredAt.toISOString(),
        version: domainEvent.version,
        payload: domainEvent.payload as TenantCreatedEvent['payload'],
      };
      await this.eventBus.publish(integrationEvent);
    }

    saved.clearDomainEvents();
    this.logger.log(`Organization created: ${saved.organizationId} (slug: ${saved.slug.value})`);

    return Result.ok(OrganizationDto.fromAggregate(saved));
  }
}
