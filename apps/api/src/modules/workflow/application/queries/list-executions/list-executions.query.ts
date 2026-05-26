import { Query } from '@atlas/shared-kernel';
import { WorkflowExecutionStatus } from '../../../domain/entities/workflow-execution.entity';

export class ListWorkflowExecutionsQuery extends Query {
  readonly status?: WorkflowExecutionStatus;
  readonly page: number;
  readonly limit: number;

  constructor(params: {
    tenantId: string;
    correlationId?: string;
    status?: WorkflowExecutionStatus;
    page?: number;
    limit?: number;
  }) {
    super({ tenantId: params.tenantId, correlationId: params.correlationId });
    this.status = params.status;
    this.page = params.page ?? 1;
    this.limit = params.limit ?? 20;
  }
}
