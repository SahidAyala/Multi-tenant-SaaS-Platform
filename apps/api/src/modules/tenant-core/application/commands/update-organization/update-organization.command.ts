import { Command, TenantPlanTier } from '@atlas/shared-kernel';

export class UpdateOrganizationCommand extends Command {
  readonly organizationId: string;
  readonly name?: string;
  readonly planTier?: TenantPlanTier;

  constructor(params: {
    organizationId: string;
    name?: string;
    planTier?: TenantPlanTier;
    tenantId: string;
    correlationId?: string;
    actorId?: string;
  }) {
    super({
      tenantId: params.tenantId,
      correlationId: params.correlationId,
      actorId: params.actorId,
    });
    this.organizationId = params.organizationId;
    this.name = params.name;
    this.planTier = params.planTier;
  }
}
