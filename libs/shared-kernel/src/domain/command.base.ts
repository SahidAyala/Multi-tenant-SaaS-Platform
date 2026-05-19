import { v4 as uuidv4 } from 'uuid';

export abstract class Command {
  readonly commandId: string;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly actorId?: string;
  readonly issuedAt: Date;

  constructor(params: { tenantId: string; correlationId?: string; actorId?: string }) {
    this.commandId = uuidv4();
    this.tenantId = params.tenantId;
    this.correlationId = params.correlationId ?? uuidv4();
    this.actorId = params.actorId;
    this.issuedAt = new Date();
  }
}
