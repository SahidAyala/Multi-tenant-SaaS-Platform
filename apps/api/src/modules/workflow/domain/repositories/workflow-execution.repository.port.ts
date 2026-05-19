import { PaginatedResult, PaginationOptions } from '@atlas/shared-kernel';
import { WorkflowExecutionEntity } from '../entities/workflow-execution.entity';

export const WORKFLOW_EXECUTION_REPOSITORY = Symbol('WORKFLOW_EXECUTION_REPOSITORY');

export interface WorkflowExecutionRepositoryPort {
  findById(id: string, tenantId: string): Promise<WorkflowExecutionEntity | null>;
  findByDefinition(
    definitionId: string,
    tenantId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<WorkflowExecutionEntity>>;
  save(execution: WorkflowExecutionEntity): Promise<WorkflowExecutionEntity>;
}
