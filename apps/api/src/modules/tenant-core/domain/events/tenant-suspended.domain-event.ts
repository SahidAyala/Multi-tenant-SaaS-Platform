import { DomainEvent, DomainEventMetadata } from '@atlas/shared-kernel';

interface TenantSuspendedEventData extends DomainEventMetadata {
  organizationId: string;
  reason: string;
  suspendedBy: string;
  suspendedAt: string;
}

export class TenantSuspendedDomainEvent extends DomainEvent {
  private readonly _organizationId: string;
  private readonly _reason: string;
  private readonly _suspendedBy: string;
  private readonly _suspendedAt: string;

  constructor(data: TenantSuspendedEventData) {
    super(data);
    this._organizationId = data.organizationId;
    this._reason = data.reason;
    this._suspendedBy = data.suspendedBy;
    this._suspendedAt = data.suspendedAt;
  }

  get payload(): Record<string, unknown> {
    return {
      organizationId: this._organizationId,
      reason: this._reason,
      suspendedBy: this._suspendedBy,
      suspendedAt: this._suspendedAt,
    };
  }
}
