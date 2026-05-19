import { Command } from '@atlas/shared-kernel';

export class TriggerWorkflowCommand extends Command {
  readonly definitionId: string;
  readonly triggerType: 'manual' | 'event' | 'schedule';
  readonly input: Record<string, unknown>;

  constructor(params: {
    tenantId: string;
    correlationId: string;
    actorId?: string;
    definitionId: string;
    triggerType?: 'manual' | 'event' | 'schedule';
    input?: Record<string, unknown>;
  }) {
    super({ tenantId: params.tenantId, correlationId: params.correlationId, actorId: params.actorId });
    this.definitionId = params.definitionId;
    this.triggerType = params.triggerType ?? 'manual';
    this.input = params.input ?? {};
  }
}
