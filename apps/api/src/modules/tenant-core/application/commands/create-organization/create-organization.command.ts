import { Command } from '@atlas/shared-kernel';
import { TenantPlanTier } from '@atlas/shared-kernel';
import { IsNotEmpty, IsString, Length } from 'class-validator';

export class CreateOrganizationCommand extends Command {
  @IsNotEmpty()
  @IsString()
  @Length(2, 100)
  readonly name: string;

  @IsNotEmpty()
  @IsString()
  @Length(3, 63)
  readonly slug: string;

  readonly planTier: TenantPlanTier;

  constructor(params: {
    name: string;
    slug: string;
    planTier?: TenantPlanTier;
    tenantId: string;
    correlationId?: string;
    actorId?: string;
  }) {
    super({ tenantId: params.tenantId, correlationId: params.correlationId, actorId: params.actorId });
    this.name = params.name;
    this.slug = params.slug;
    this.planTier = params.planTier ?? TenantPlanTier.FREE;
  }
}
