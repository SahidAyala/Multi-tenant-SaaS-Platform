import { DomainEvent, DomainEventMetadata } from '@atlas/shared-kernel';

interface TenantCreatedEventData extends DomainEventMetadata {
  organizationId: string;
  name: string;
  slug: string;
  plan: string;
  ownerId: string;
}

export class TenantCreatedDomainEvent extends DomainEvent {
  private readonly _organizationId: string;
  private readonly _name: string;
  private readonly _slug: string;
  private readonly _plan: string;
  private readonly _ownerId: string;

  constructor(data: TenantCreatedEventData) {
    super(data);
    this._organizationId = data.organizationId;
    this._name = data.name;
    this._slug = data.slug;
    this._plan = data.plan;
    this._ownerId = data.ownerId;
  }

  get payload(): Record<string, unknown> {
    return {
      organizationId: this._organizationId,
      name: this._name,
      slug: this._slug,
      plan: this._plan,
      ownerId: this._ownerId,
    };
  }
}
