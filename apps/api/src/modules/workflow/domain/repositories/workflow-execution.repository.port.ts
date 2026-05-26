import { PaginatedResult, PaginationOptions } from '@atlas/shared-kernel';
import { WorkflowExecutionEntity, WorkflowExecutionStatus } from '../entities/workflow-execution.entity';

export interface WorkflowExecutionListFilters {
  status?: WorkflowExecutionStatus;
}

export abstract class WorkflowExecutionRepositoryPort {
  abstract findById(id: string): Promise<WorkflowExecutionEntity | null>;
  abstract findByDefinition(definitionId: string, options?: PaginationOptions): Promise<PaginatedResult<WorkflowExecutionEntity>>;
  abstract findMany(
    filters: WorkflowExecutionListFilters,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<WorkflowExecutionEntity>>;
  abstract save(execution: WorkflowExecutionEntity): Promise<WorkflowExecutionEntity>;
}
