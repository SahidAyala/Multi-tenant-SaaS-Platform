import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { TenantRootRepository, SystemQueryContext } from '@atlas/shared-kernel';
import { TenantContextService } from '../../../../common/tenant-context/tenant-context.service';
import { OrganizationAggregate } from '../../domain/aggregates/organization.aggregate';
import { OrganizationRepositoryPort } from '../../domain/repositories/organization.repository.port';
import { OrganizationOrmEntity } from './organization.orm-entity';
import { OrganizationMapper } from './organization.mapper';

@Injectable()
export class OrganizationRepository
  extends TenantRootRepository<OrganizationOrmEntity>
  implements OrganizationRepositoryPort
{
  constructor(
    @InjectRepository(OrganizationOrmEntity)
    repo: Repository<OrganizationOrmEntity>,
    tenantContext: TenantContextService,
    private readonly mapper: OrganizationMapper,
  ) {
    super(repo, tenantContext);
  }

  // ── Tenant-context operations ──────────────────────────────────────────────

  async findById(id: string): Promise<OrganizationAggregate | null> {
    this.guardTenantRoot(id);
    const orm = await this.repo.findOne({
      where: { id } as FindOptionsWhere<OrganizationOrmEntity>,
    });
    return orm ? this.mapper.toDomain(orm) : null;
  }

  async save(organization: OrganizationAggregate): Promise<OrganizationAggregate> {
    this.guardTenantRoot(organization.organizationId);
    const orm = this.mapper.toOrm(organization);
    const saved = await this.repo.save(orm);
    return this.mapper.toDomain(saved);
  }

  async existsById(id: string): Promise<boolean> {
    this.guardTenantRoot(id);
    return this.repo.existsBy({ id } as FindOptionsWhere<OrganizationOrmEntity>);
  }

  // ── System-context operations ──────────────────────────────────────────────

  async findBySlug(slug: string, ctx: SystemQueryContext): Promise<OrganizationAggregate | null> {
    const orm = await this.systemQb('o', ctx)
      .where('o.slug = :slug', { slug })
      .getOne();
    return orm ? this.mapper.toDomain(orm) : null;
  }

  async existsBySlug(slug: string, ctx: SystemQueryContext): Promise<boolean> {
    const count = await this.systemQb('o', ctx)
      .where('o.slug = :slug', { slug })
      .getCount();
    return count > 0;
  }

  async findByOwnerId(
    ownerId: string,
    ctx: SystemQueryContext,
  ): Promise<OrganizationAggregate | null> {
    const orm = await this.systemQb('o', ctx)
      .where('o.owner_id = :ownerId', { ownerId })
      .getOne();
    return orm ? this.mapper.toDomain(orm) : null;
  }

  async provision(
    organization: OrganizationAggregate,
    ctx: SystemQueryContext,
  ): Promise<OrganizationAggregate> {
    // systemQb is passed to document intent; actual insert uses repo.save directly
    // since TypeORM's save does not require a QB.
    void ctx;
    const orm = this.mapper.toOrm(organization);
    const saved = await this.repo.save(orm);
    return this.mapper.toDomain(saved);
  }
}
