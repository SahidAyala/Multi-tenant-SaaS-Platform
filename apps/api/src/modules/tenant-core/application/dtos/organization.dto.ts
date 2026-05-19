import { OrganizationAggregate } from '../../domain/aggregates/organization.aggregate';

export class OrganizationDto {
  readonly organizationId: string;
  readonly name: string;
  readonly slug: string;
  readonly plan: string;
  readonly status: string;
  readonly ownerId: string;
  readonly provisionedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;

  static fromAggregate(org: OrganizationAggregate): OrganizationDto {
    return {
      organizationId: org.organizationId,
      name: org.name,
      slug: org.slug.value,
      plan: org.plan.tier,
      status: org.status,
      ownerId: org.ownerId,
      provisionedAt: org.provisionedAt?.toISOString(),
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    };
  }
}
