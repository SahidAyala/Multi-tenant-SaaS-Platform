import { SystemQueryContext } from '@atlas/shared-kernel';
import { OrganizationAggregate } from '../aggregates/organization.aggregate';

/**
 * Two method categories, separated by trust boundary:
 *
 * Tenant-context methods — require an active tenant context in AsyncLocalStorage.
 * The implementation verifies that the requested aggregate ID equals the current
 * tenant ID, preventing cross-tenant access.
 *
 * System-context methods — accept a SystemQueryContext because they operate
 * outside any tenant context (e.g., slug uniqueness checks during provisioning,
 * super-admin lookups). The caller MUST explicitly construct a SystemQueryContext
 * to explain why the tenant boundary is being bypassed.
 */
export abstract class OrganizationRepositoryPort {
  // ── Tenant-context operations ────────────────────────────────────────────
  abstract findById(id: string): Promise<OrganizationAggregate | null>;
  abstract save(organization: OrganizationAggregate): Promise<OrganizationAggregate>;
  abstract existsById(id: string): Promise<boolean>;

  // ── System-context operations ────────────────────────────────────────────
  abstract findBySlug(slug: string, ctx: SystemQueryContext): Promise<OrganizationAggregate | null>;
  abstract existsBySlug(slug: string, ctx: SystemQueryContext): Promise<boolean>;
  abstract provision(organization: OrganizationAggregate, ctx: SystemQueryContext): Promise<OrganizationAggregate>;
}
