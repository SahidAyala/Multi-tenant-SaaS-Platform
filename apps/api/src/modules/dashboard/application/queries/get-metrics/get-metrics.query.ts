import { Query } from '@atlas/shared-kernel';

export class GetDashboardMetricsQuery extends Query {
  constructor(params: { tenantId: string; correlationId?: string }) {
    super({ tenantId: params.tenantId, correlationId: params.correlationId });
  }
}
