import { Query } from '@atlas/shared-kernel';

export class GetEventSeriesQuery extends Query {
  constructor(params: { tenantId: string; correlationId?: string }) {
    super({ tenantId: params.tenantId, correlationId: params.correlationId });
  }
}
