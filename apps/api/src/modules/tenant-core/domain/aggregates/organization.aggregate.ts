import { AggregateRoot, TenantStatus, TenantPlanTier, generateId } from '@atlas/shared-kernel';
import { TenantSlug } from '../value-objects/tenant-slug.vo';
import { TenantPlan } from '../value-objects/tenant-plan.vo';
import { TenantCreatedDomainEvent } from '../events/tenant-created.domain-event';
import { TenantProvisionedDomainEvent } from '../events/tenant-provisioned.domain-event';
import { TenantSuspendedDomainEvent } from '../events/tenant-suspended.domain-event';
import { ConflictException } from '@atlas/shared-kernel';

export interface OrganizationProps {
  organizationId: string;
  name: string;
  slug: TenantSlug;
  plan: TenantPlan;
  status: TenantStatus;
  ownerId: string;
  provisionedAt?: Date;
  settings: OrganizationSettings;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OrganizationSettings {
  allowPublicSignup: boolean;
  enforcesMfa: boolean;
  ssoEnabled: boolean;
  auditEnabled: boolean;
}

export class OrganizationAggregate extends AggregateRoot<string> {
  private _name: string;
  private _slug: TenantSlug;
  private _plan: TenantPlan;
  private _status: TenantStatus;
  private _ownerId: string;
  private _provisionedAt?: Date;
  private _settings: OrganizationSettings;

  private constructor(props: OrganizationProps) {
    super({
      id: props.organizationId,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });
    this._name = props.name;
    this._slug = props.slug;
    this._plan = props.plan;
    this._status = props.status;
    this._ownerId = props.ownerId;
    this._provisionedAt = props.provisionedAt;
    this._settings = props.settings;
  }

  static create(params: {
    name: string;
    slug: string;
    planTier: TenantPlanTier;
    ownerId: string;
    correlationId: string;
  }): OrganizationAggregate {
    const organizationId = generateId();
    const slug = TenantSlug.create(params.slug);
    const plan = TenantPlan.forTier(params.planTier);

    const org = new OrganizationAggregate({
      organizationId,
      name: params.name,
      slug,
      plan,
      status: TenantStatus.PROVISIONING,
      ownerId: params.ownerId,
      settings: {
        allowPublicSignup: false,
        enforcesMfa: false,
        ssoEnabled: false,
        auditEnabled: true,
      },
    });

    org.addDomainEvent(
      new TenantCreatedDomainEvent({
        tenantId: organizationId,
        correlationId: params.correlationId,
        actorId: params.ownerId,
        organizationId,
        name: params.name,
        slug: slug.value,
        plan: params.planTier,
        ownerId: params.ownerId,
      }),
    );

    return org;
  }

  static reconstitute(props: OrganizationProps): OrganizationAggregate {
    return new OrganizationAggregate(props);
  }

  markProvisioned(defaultProjectId: string, correlationId: string): void {
    if (this._status !== TenantStatus.PROVISIONING) {
      throw new ConflictException(`Cannot provision organization in status: ${this._status}`);
    }

    this._status = TenantStatus.ACTIVE;
    this._provisionedAt = new Date();
    this.touch();

    this.addDomainEvent(
      new TenantProvisionedDomainEvent({
        tenantId: this._id,
        correlationId,
        organizationId: this._id,
        defaultProjectId,
        provisionedAt: this._provisionedAt.toISOString(),
      }),
    );
  }

  suspend(params: { reason: string; suspendedBy: string; correlationId: string }): void {
    if (this._status !== TenantStatus.ACTIVE) {
      throw new ConflictException(`Cannot suspend organization in status: ${this._status}`);
    }
    this._status = TenantStatus.SUSPENDED;
    const suspendedAt = new Date();
    this.touch();

    this.addDomainEvent(
      new TenantSuspendedDomainEvent({
        tenantId: this._id,
        correlationId: params.correlationId,
        actorId: params.suspendedBy,
        organizationId: this._id,
        reason: params.reason,
        suspendedBy: params.suspendedBy,
        suspendedAt: suspendedAt.toISOString(),
      }),
    );
  }

  rename(newName: string): void {
    const trimmed = newName.trim();
    if (trimmed.length < 2 || trimmed.length > 100) {
      throw new ConflictException('Organization name must be between 2 and 100 characters');
    }
    if (trimmed === this._name) return;
    this._name = trimmed;
    this.touch();
  }

  changePlan(planTier: TenantPlanTier): void {
    if (this._plan.tier === planTier) return;
    this._plan = TenantPlan.forTier(planTier);
    this.touch();
  }

  reactivate(): void {
    if (this._status !== TenantStatus.SUSPENDED) {
      throw new ConflictException(`Cannot reactivate organization in status: ${this._status}`);
    }
    this._status = TenantStatus.ACTIVE;
    this.touch();
  }

  updateSettings(settings: Partial<OrganizationSettings>): void {
    this._settings = { ...this._settings, ...settings };
    this.touch();
  }

  get organizationId(): string { return this._id; }
  get name(): string { return this._name; }
  get slug(): TenantSlug { return this._slug; }
  get plan(): TenantPlan { return this._plan; }
  get status(): TenantStatus { return this._status; }
  get ownerId(): string { return this._ownerId; }
  get provisionedAt(): Date | undefined { return this._provisionedAt; }
  get settings(): OrganizationSettings { return { ...this._settings }; }
  get isActive(): boolean { return this._status === TenantStatus.ACTIVE; }
}
