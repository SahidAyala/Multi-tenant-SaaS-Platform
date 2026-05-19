import { v4 as uuidv4 } from 'uuid';

export interface DomainEventMetadata {
  readonly tenantId: string;
  readonly correlationId: string;
  readonly actorId?: string;
  readonly causationId?: string;
}

export abstract class DomainEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly actorId?: string;
  readonly causationId?: string;
  readonly occurredAt: Date;
  readonly version: number = 1;

  constructor(metadata: DomainEventMetadata) {
    this.eventId = uuidv4();
    this.eventType = this.constructor.name;
    this.tenantId = metadata.tenantId;
    this.correlationId = metadata.correlationId;
    this.actorId = metadata.actorId;
    this.causationId = metadata.causationId;
    this.occurredAt = new Date();
  }

  abstract get payload(): Record<string, unknown>;

  toJSON(): Record<string, unknown> {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      tenantId: this.tenantId,
      correlationId: this.correlationId,
      actorId: this.actorId,
      causationId: this.causationId,
      occurredAt: this.occurredAt.toISOString(),
      version: this.version,
      payload: this.payload,
    };
  }
}
