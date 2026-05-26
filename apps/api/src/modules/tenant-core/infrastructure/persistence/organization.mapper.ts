import { Injectable } from '@nestjs/common';
import { OrganizationAggregate, OrganizationSettings } from '../../domain/aggregates/organization.aggregate';
import { OrganizationOrmEntity } from './organization.orm-entity';
import { TenantSlug } from '../../domain/value-objects/tenant-slug.vo';
import { TenantPlan } from '../../domain/value-objects/tenant-plan.vo';

@Injectable()
export class OrganizationMapper {
  toDomain(orm: OrganizationOrmEntity): OrganizationAggregate {
    return OrganizationAggregate.reconstitute({
      organizationId: orm.id,
      name: orm.name,
      slug: TenantSlug.create(orm.slug),
      plan: TenantPlan.forTier(orm.planTier),
      status: orm.status,
      ownerId: orm.ownerId,
      provisionedAt: orm.provisionedAt,
      settings: orm.settings as unknown as OrganizationSettings,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }

  toOrm(domain: OrganizationAggregate): OrganizationOrmEntity {
    const orm = new OrganizationOrmEntity();
    orm.id = domain.organizationId;
    orm.name = domain.name;
    orm.slug = domain.slug.value;
    orm.planTier = domain.plan.tier;
    orm.status = domain.status;
    orm.ownerId = domain.ownerId;
    orm.provisionedAt = domain.provisionedAt;
    orm.settings = domain.settings as unknown as Record<string, unknown>;
    orm.createdAt = domain.createdAt;
    orm.updatedAt = domain.updatedAt;
    return orm;
  }
}
