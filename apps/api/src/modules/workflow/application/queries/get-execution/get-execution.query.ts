import { Query } from '@atlas/shared-kernel';

export class GetWorkflowExecutionQuery extends Query {
  readonly executionId: string;

  constructor(params: { tenantId: string; correlationId?: string; executionId: string }) {
    super({ tenantId: params.tenantId, correlationId: params.correlationId });
    this.executionId = params.executionId;
  }
}
