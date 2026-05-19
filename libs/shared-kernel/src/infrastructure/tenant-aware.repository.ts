import { Repository, SelectQueryBuilder, FindOptionsWhere } from 'typeorm';
import { ITenantContextPort } from './tenant-context.port';
import { SystemQueryContext } from './system-query-context';
import { ForbiddenException } from '../exceptions/forbidden.exception';

// ─────────────────────────────────────────────────────────────────────────────
// Internal shared base — not exported. Contains the logic common to both
// TenantScopedRepository and TenantRootRepository.
// ─────────────────────────────────────────────────────────────────────────────

abstract class TenantRepositoryBase<E extends object> {
  constructor(
    protected readonly repo: Repository<E>,
    protected readonly tenantContext: ITenantContextPort,
  ) {}

  protected requireTenantId(): string {
    const id = this.tenantContext.tryGetTenantId();
    if (!id) {
      throw new Error(
        `${this.constructor.name}: operation requires an active tenant context. ` +
          `For system-level operations, use a method that accepts SystemQueryContext.`,
      );
    }
    return id;
  }

  /**
   * Returns an unscoped QueryBuilder. The SystemQueryContext parameter is
   * intentionally required to force the caller to be explicit about WHY
   * they are bypassing tenant isolation.
   *
   * Future: ctx can be used to emit audit log entries for every unscoped query.
   */
  protected systemQb(alias: string, _ctx: SystemQueryContext): SelectQueryBuilder<E> {
    return this.repo.createQueryBuilder(alias);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TenantScopedRepository — extend this for entities that carry a tenantId column.
//
// Examples: AuditEventOrmEntity, WorkflowDefinitionOrmEntity, WorkflowExecutionOrmEntity
//
// The generic constraint `E extends { tenantId: string }` ensures at compile time
// that only entities with a tenantId column can use these helpers.
// ─────────────────────────────────────────────────────────────────────────────

export abstract class TenantScopedRepository<E extends { tenantId: string }> extends TenantRepositoryBase<E> {
  /**
   * Merges the current tenant ID into a FindOptionsWhere clause.
   * Use for simple findOne / find queries:
   *
   *   this.repo.findOne({ where: this.scopedWhere({ id }) })
   *   this.repo.find({ where: this.scopedWhere({ status: 'active' }) })
   */
  protected scopedWhere(extra?: FindOptionsWhere<E>): FindOptionsWhere<E> {
    return { tenantId: this.requireTenantId(), ...(extra ?? {}) } as unknown as FindOptionsWhere<E>;
  }

  /**
   * Returns a QueryBuilder pre-filtered to the current tenant.
   * Chain .andWhere() calls for additional predicates:
   *
   *   this.scopedQb('ae')
   *     .andWhere('ae.action = :action', { action })
   *     .orderBy('ae.occurredAt', 'DESC')
   *     .getMany()
   */
  protected scopedQb(alias: string): SelectQueryBuilder<E> {
    return this.repo
      .createQueryBuilder(alias)
      .where(`${alias}.tenantId = :tenantId`, { tenantId: this.requireTenantId() });
  }

  /**
   * Defensive check for write paths: confirms an entity's tenantId matches the
   * active tenant context before persisting. Prevents a handler from accidentally
   * saving an entity constructed with the wrong tenantId.
   *
   *   this.guardTenantOwnership(event.tenantId);
   *   await this.repo.insert(toOrm(event));
   */
  protected guardTenantOwnership(entityTenantId: string): void {
    const tenantId = this.requireTenantId();
    if (entityTenantId !== tenantId) {
      throw new ForbiddenException(
        `Tenant isolation violation in ${this.constructor.name}: ` +
          `entity.tenantId=${entityTenantId} but context.tenantId=${tenantId}`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TenantRootRepository — extend this for the org-as-tenant pattern, where the
// aggregate's primary key IS the tenantId (i.e., organizations table).
//
// Because the org's `id` is the tenant, there is no separate tenantId column
// to filter on. Instead we guard that any lookup ID equals the active tenant ID,
// preventing one tenant from reading another tenant's root aggregate.
// ─────────────────────────────────────────────────────────────────────────────

export abstract class TenantRootRepository<E extends object> extends TenantRepositoryBase<E> {
  /**
   * Asserts that the requested aggregate ID equals the active tenant ID.
   * Call this at the start of every tenant-context method:
   *
   *   async findById(id: string): Promise<OrganizationAggregate | null> {
   *     this.guardTenantRoot(id);
   *     return this.repo.findOne({ where: { id } as FindOptionsWhere<E> });
   *   }
   */
  protected guardTenantRoot(aggregateId: string): void {
    const tenantId = this.requireTenantId();
    if (aggregateId !== tenantId) {
      throw new ForbiddenException(
        `${this.constructor.name}: cannot access organization ${aggregateId} ` +
          `from tenant context ${tenantId}`,
      );
    }
  }
}
