import { WorkflowExecutionEntity } from '../../domain/entities/workflow-execution.entity';

export class WorkflowExecutionDto {
  readonly executionId!: string;
  readonly definitionId!: string;
  readonly tenantId!: string;
  readonly correlationId!: string;
  readonly triggeredBy!: string;
  readonly triggerType!: 'manual' | 'event' | 'schedule';
  readonly status!: string;
  readonly input!: Record<string, unknown>;
  readonly stepResults!: ReadonlyArray<unknown>;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly errorMessage?: string;
  readonly createdAt!: string;

  static fromEntity(execution: WorkflowExecutionEntity): WorkflowExecutionDto {
    return {
      executionId: execution.executionId,
      definitionId: execution.definitionId,
      tenantId: execution.tenantId,
      correlationId: execution.correlationId,
      triggeredBy: execution.triggeredBy,
      triggerType: execution.triggerType,
      status: execution.status,
      input: execution.input as Record<string, unknown>,
      stepResults: execution.stepResults,
      startedAt: execution.startedAt?.toISOString(),
      completedAt: execution.completedAt?.toISOString(),
      durationMs: execution.durationMs,
      errorMessage: execution.errorMessage,
      createdAt: execution.createdAt.toISOString(),
    };
  }
}
