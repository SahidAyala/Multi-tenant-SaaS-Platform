import { Injectable, Logger } from '@nestjs/common';
import { isNil } from '@atlas/shared-kernel';
import { NotFoundException, Result } from '@atlas/shared-kernel';
import { WORKFLOW_TRIGGERED, WorkflowTriggeredEvent } from '@atlas/event-contracts';
import { TriggerWorkflowCommand } from './trigger-workflow.command';
import { WorkflowDefinitionRepositoryPort } from '../../../domain/repositories/workflow-definition.repository.port';
import { WorkflowExecutionRepositoryPort } from '../../../domain/repositories/workflow-execution.repository.port';
import { WorkflowExecutionEntity } from '../../../domain/entities/workflow-execution.entity';
import { IEventBus } from '../../../../platform-events/ports/event-bus.port';

export interface TriggerWorkflowResult {
  executionId: string;
  definitionId: string;
  status: string;
}

@Injectable()
export class TriggerWorkflowHandler {
  private readonly logger = new Logger(TriggerWorkflowHandler.name);

  constructor(
    private readonly definitionRepository: WorkflowDefinitionRepositoryPort,
    private readonly executionRepository: WorkflowExecutionRepositoryPort,
    private readonly eventBus: IEventBus,
  ) {}

  async execute(command: TriggerWorkflowCommand): Promise<Result<TriggerWorkflowResult>> {
    const definition = await this.definitionRepository.findById(command.definitionId);

    if (isNil(definition)) {
      return Result.fail(new NotFoundException('WorkflowDefinition', command.definitionId));
    }

    if (!definition.isActive) {
      return Result.fail(
        new Error(`Workflow definition '${definition.definitionId}' is not active`),
      );
    }

    const execution = WorkflowExecutionEntity.create({
      definitionId: definition.definitionId,
      tenantId: command.tenantId,
      correlationId: command.correlationId,
      triggeredBy: command.actorId ?? 'system',
      triggerType: command.triggerType,
      input: command.input,
    });

    const saved = await this.executionRepository.save(execution);

    const event: WorkflowTriggeredEvent = {
      eventId: saved.executionId,
      eventType: WORKFLOW_TRIGGERED,
      eventVersion: 1,
      tenantId: saved.tenantId,
      correlationId: saved.correlationId,
      actorId: command.actorId,
      sourceService: 'atlas-saas-platform',
      occurredAt: new Date().toISOString(),
      payload: {
        executionId: saved.executionId,
        definitionId: saved.definitionId,
        definitionName: definition.name,
        triggeredBy: saved.triggeredBy,
        triggerType: saved.triggerType,
        input: command.input,
      },
    };

    await this.eventBus.publish(event);
    this.logger.log(`Workflow triggered: ${saved.executionId} (def: ${definition.definitionId})`);

    return Result.ok({
      executionId: saved.executionId,
      definitionId: saved.definitionId,
      status: saved.status,
    });
  }
}
