import { Command } from '@atlas/shared-kernel';

export class CancelWorkflowExecutionCommand extends Command {
  readonly executionId: string;
  readonly reason?: string;

  constructor(params: {
    executionId: string;
    reason?: string;
    tenantId: string;
    correlationId?: string;
    actorId?: string;
  }) {
    super({
      tenantId: params.tenantId,
      correlationId: params.correlationId,
      actorId: params.actorId,
    });
    this.executionId = params.executionId;
    this.reason = params.reason;
  }
}
