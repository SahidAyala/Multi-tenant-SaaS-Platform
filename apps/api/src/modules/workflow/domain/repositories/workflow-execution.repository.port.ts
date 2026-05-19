import { PaginatedResult, PaginationOptions } from '@atlas/shared-kernel';
import { WorkflowExecutionEntity } from '../entities/workflow-execution.entity';

export abstract class WorkflowExecutionRepositoryPort {
  abstract findById(id: string): Promise<WorkflowExecutionEntity | null>;
  abstract findByDefinition(definitionId: string, options?: PaginationOptions): Promise<PaginatedResult<WorkflowExecutionEntity>>;
  abstract save(execution: WorkflowExecutionEntity): Promise<WorkflowExecutionEntity>;
}
