import { Injectable, Logger } from '@nestjs/common';
import { NotFoundException, Result, isNil, isUndefined } from '@atlas/shared-kernel';
import { UpdateOrganizationCommand } from './update-organization.command';
import { OrganizationRepositoryPort } from '../../../domain/repositories/organization.repository.port';
import { OrganizationDto } from '../../dtos/organization.dto';

@Injectable()
export class UpdateOrganizationHandler {
  private readonly logger = new Logger(UpdateOrganizationHandler.name);

  constructor(private readonly organizationRepository: OrganizationRepositoryPort) {}

  async execute(command: UpdateOrganizationCommand): Promise<Result<OrganizationDto>> {
    const organization = await this.organizationRepository.findById(command.organizationId);
    if (isNil(organization)) {
      return Result.fail(new NotFoundException('Organization', command.organizationId));
    }

    if (!isUndefined(command.name)) {
      organization.rename(command.name);
    }

    if (!isUndefined(command.planTier)) {
      organization.changePlan(command.planTier);
    }

    const saved = await this.organizationRepository.save(organization);
    this.logger.log(`Organization updated: ${saved.organizationId}`);

    return Result.ok(OrganizationDto.fromAggregate(saved));
  }
}
