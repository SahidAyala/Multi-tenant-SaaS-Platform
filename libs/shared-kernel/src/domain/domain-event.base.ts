import { v4 as uuidv4 } from 'uuid';

export interface DomainEventMetadata {
  readonly tenantId: string;
  readonly correlationId: string;
  readonly actorId?: string;
  readonly causationId?: string;
  readonly traceId?: string;
  // sourceService defaults to 'atlas-saas-platform'; override in cross-service contexts.
  readonly sourceService?: string;
  readonly sourceVersion?: string;
}

export abstract class DomainEvent {
  readonly eventId: string;
  readonly eventType: string;
  // eventVersion is the schema/contract version of this event type.
  // Distinct from the stream sequence version assigned by Event Streaming.
  readonly eventVersion: number = 1;
  readonly tenantId: string;
  readonly correlationId: string;
  readonly actorId?: string;
  readonly causationId?: string;
  readonly traceId?: string;
  readonly sourceService: string;
  readonly sourceVersion?: string;
  readonly occurredAt: Date;

  constructor(metadata: DomainEventMetadata) {
    this.eventId = uuidv4();
    this.eventType = this.constructor.name;
    this.tenantId = metadata.tenantId;
    this.correlationId = metadata.correlationId;
    this.actorId = metadata.actorId;
    this.causationId = metadata.causationId;
    this.traceId = metadata.traceId;
    this.sourceService = metadata.sourceService ?? 'atlas-saas-platform';
    this.sourceVersion = metadata.sourceVersion;
    this.occurredAt = new Date();
  }

  abstract get payload(): Record<string, unknown>;

  toJSON(): Record<string, unknown> {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      eventVersion: this.eventVersion,
      tenantId: this.tenantId,
      correlationId: this.correlationId,
      actorId: this.actorId,
      causationId: this.causationId,
      traceId: this.traceId,
      sourceService: this.sourceService,
      sourceVersion: this.sourceVersion,
      occurredAt: this.occurredAt.toISOString(),
      payload: this.payload,
    };
  }
}
