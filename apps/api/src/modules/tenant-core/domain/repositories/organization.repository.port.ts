import { OrganizationAggregate } from '../aggregates/organization.aggregate';

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');

export interface OrganizationRepositoryPort {
  findById(id: string): Promise<OrganizationAggregate | null>;
  findBySlug(slug: string): Promise<OrganizationAggregate | null>;
  save(organization: OrganizationAggregate): Promise<OrganizationAggregate>;
  existsBySlug(slug: string): Promise<boolean>;
  existsById(id: string): Promise<boolean>;
}
