import { DomainEvent, DomainEventMetadata } from '@atlas/shared-kernel';

interface TenantProvisionedEventData extends DomainEventMetadata {
  organizationId: string;
  defaultProjectId: string;
  provisionedAt: string;
}

export class TenantProvisionedDomainEvent extends DomainEvent {
  private readonly _organizationId: string;
  private readonly _defaultProjectId: string;
  private readonly _provisionedAt: string;

  constructor(data: TenantProvisionedEventData) {
    super(data);
    this._organizationId = data.organizationId;
    this._defaultProjectId = data.defaultProjectId;
    this._provisionedAt = data.provisionedAt;
  }

  get payload(): Record<string, unknown> {
    return {
      organizationId: this._organizationId,
      defaultProjectId: this._defaultProjectId,
      provisionedAt: this._provisionedAt,
    };
  }
}
