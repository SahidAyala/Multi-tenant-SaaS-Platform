import { Entity, generateId } from '@atlas/shared-kernel';

export type AuditActorType = 'user' | 'api_key' | 'system';
export type AuditOutcome = 'success' | 'failure';

export interface AuditEventProps {
  auditEventId: string;
  tenantId: string;
  actorId?: string;
  actorType: AuditActorType;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: AuditOutcome;
  metadata: Record<string, unknown>;
  correlationId: string;
  ipAddress?: string;
  userAgent?: string;
  occurredAt: Date;
}

/**
 * AuditEvent is append-only by design — no update methods.
 * The DB enforces immutability via permissions (no UPDATE on audit_events).
 */
export class AuditEventEntity extends Entity<string> {
  private readonly _tenantId: string;
  private readonly _actorId?: string;
  private readonly _actorType: AuditActorType;
  private readonly _action: string;
  private readonly _resourceType: string;
  private readonly _resourceId: string;
  private readonly _outcome: AuditOutcome;
  private readonly _metadata: Record<string, unknown>;
  private readonly _correlationId: string;
  private readonly _ipAddress?: string;
  private readonly _userAgent?: string;
  private readonly _occurredAt: Date;

  private constructor(props: AuditEventProps) {
    super({ id: props.auditEventId });
    this._tenantId = props.tenantId;
    this._actorId = props.actorId;
    this._actorType = props.actorType;
    this._action = props.action;
    this._resourceType = props.resourceType;
    this._resourceId = props.resourceId;
    this._outcome = props.outcome;
    this._metadata = Object.freeze({ ...props.metadata });
    this._correlationId = props.correlationId;
    this._ipAddress = props.ipAddress;
    this._userAgent = props.userAgent;
    this._occurredAt = props.occurredAt;
  }

  static create(params: Omit<AuditEventProps, 'auditEventId'>): AuditEventEntity {
    return new AuditEventEntity({ auditEventId: generateId(), ...params });
  }

  static reconstitute(props: AuditEventProps): AuditEventEntity {
    return new AuditEventEntity(props);
  }

  get auditEventId(): string { return this._id; }
  get tenantId(): string { return this._tenantId; }
  get actorId(): string | undefined { return this._actorId; }
  get actorType(): AuditActorType { return this._actorType; }
  get action(): string { return this._action; }
  get resourceType(): string { return this._resourceType; }
  get resourceId(): string { return this._resourceId; }
  get outcome(): AuditOutcome { return this._outcome; }
  get metadata(): Readonly<Record<string, unknown>> { return this._metadata; }
  get correlationId(): string { return this._correlationId; }
  get ipAddress(): string | undefined { return this._ipAddress; }
  get userAgent(): string | undefined { return this._userAgent; }
  get occurredAt(): Date { return this._occurredAt; }
}
