import { v4 as uuidv4 } from 'uuid';

export abstract class Query {
  readonly queryId: string;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly requestedAt: Date;

  constructor(params: { tenantId: string; correlationId?: string }) {
    this.queryId = uuidv4();
    this.tenantId = params.tenantId;
    this.correlationId = params.correlationId ?? uuidv4();
    this.requestedAt = new Date();
  }
}
