import { Entity as EntityBase, generateId } from '@atlas/shared-kernel';

export type OutboxEntryStatus = 'pending' | 'processed' | 'failed';

export interface OutboxEntryProps {
  outboxEntryId: string;
  eventId: string;
  eventType: string;
  eventVersion: number;
  tenantId: string;
  correlationId: string;
  actorId?: string;
  causationId?: string;
  traceId?: string;
  sourceService: string;
  sourceVersion?: string;
  payload: Record<string, unknown>;
  status: OutboxEntryStatus;
  attempts: number;
  lastError?: string;
  occurredAt: Date;
  createdAt: Date;
  processedAt?: Date;
}

/**
 * Outbox entry representing an event waiting to be forwarded to the external event backbone.
 * Append-only per event; status transitions (pending → processed/failed) are handled by the processor.
 */
export class OutboxEntryEntity extends EntityBase<string> {
  private _eventId: string;
  private _eventType: string;
  private _eventVersion: number;
  private _tenantId: string;
  private _correlationId: string;
  private _actorId?: string;
  private _causationId?: string;
  private _traceId?: string;
  private _sourceService: string;
  private _sourceVersion?: string;
  private _payload: Record<string, unknown>;
  private _status: OutboxEntryStatus;
  private _attempts: number;
  private _lastError?: string;
  private readonly _occurredAt: Date;
  private _processedAt?: Date;

  private constructor(props: OutboxEntryProps) {
    super({ id: props.outboxEntryId, createdAt: props.createdAt });
    this._eventId = props.eventId;
    this._eventType = props.eventType;
    this._eventVersion = props.eventVersion;
    this._tenantId = props.tenantId;
    this._correlationId = props.correlationId;
    this._actorId = props.actorId;
    this._causationId = props.causationId;
    this._traceId = props.traceId;
    this._sourceService = props.sourceService;
    this._sourceVersion = props.sourceVersion;
    this._payload = props.payload;
    this._status = props.status;
    this._attempts = props.attempts;
    this._lastError = props.lastError;
    this._occurredAt = props.occurredAt;
    this._processedAt = props.processedAt;
  }

  static create(params: Omit<OutboxEntryProps, 'outboxEntryId' | 'status' | 'attempts' | 'createdAt'>): OutboxEntryEntity {
    return new OutboxEntryEntity({
      outboxEntryId: generateId(),
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
      ...params,
    });
  }

  static reconstitute(props: OutboxEntryProps): OutboxEntryEntity {
    return new OutboxEntryEntity(props);
  }

  markProcessed(): void {
    this._status = 'processed';
    this._processedAt = new Date();
  }

  recordAttemptFailure(error: string, maxAttempts: number): void {
    this._attempts += 1;
    this._lastError = error;
    if (this._attempts >= maxAttempts) {
      this._status = 'failed';
    }
  }

  get outboxEntryId(): string { return this._id; }
  get eventId(): string { return this._eventId; }
  get eventType(): string { return this._eventType; }
  get eventVersion(): number { return this._eventVersion; }
  get tenantId(): string { return this._tenantId; }
  get correlationId(): string { return this._correlationId; }
  get actorId(): string | undefined { return this._actorId; }
  get causationId(): string | undefined { return this._causationId; }
  get traceId(): string | undefined { return this._traceId; }
  get sourceService(): string { return this._sourceService; }
  get sourceVersion(): string | undefined { return this._sourceVersion; }
  get payload(): Record<string, unknown> { return this._payload; }
  get status(): OutboxEntryStatus { return this._status; }
  get attempts(): number { return this._attempts; }
  get lastError(): string | undefined { return this._lastError; }
  get occurredAt(): Date { return this._occurredAt; }
  get createdAt(): Date { return this._createdAt; }
  get processedAt(): Date | undefined { return this._processedAt; }
}
