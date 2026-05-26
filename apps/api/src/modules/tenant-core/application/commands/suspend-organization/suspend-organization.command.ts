import { Command } from '@atlas/shared-kernel';

export class SuspendOrganizationCommand extends Command {
  readonly organizationId: string;
  readonly reason: string;

  constructor(params: {
    organizationId: string;
    reason: string;
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
    this.reason = params.reason;
  }
}
