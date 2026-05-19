import { Injectable } from '@nestjs/common';
import { isEmpty } from '@atlas/shared-kernel';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedRepository, buildPaginationMeta } from '@atlas/shared-kernel';
import { TenantContextService } from '../../../../common/tenant-context/tenant-context.service';
import {
  AuditEventRepositoryPort,
  AuditEventFilter,
} from '../../domain/repositories/audit-event.repository.port';

import { AuditEventEntity } from '../../domain/entities/audit-event.entity';
import { AuditEventOrmEntity } from './audit-event.orm-entity';
import { PaginatedResult, PaginationOptions } from '@atlas/shared-kernel';

@Injectable()
export class AuditEventRepository
  extends TenantScopedRepository<AuditEventOrmEntity>
  implements AuditEventRepositoryPort
{
  constructor(
    @InjectRepository(AuditEventOrmEntity)
    repo: Repository<AuditEventOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async append(event: AuditEventEntity): Promise<AuditEventEntity> {
    // Double-check: the entity's own tenantId must match the ALS context.
    // Catches bugs where an entity was constructed with the wrong tenantId.
    this.guardTenantOwnership(event.tenantId);
    await this.repo.insert(this.toOrm(event));
    return event;
  }

  async appendBatch(events: AuditEventEntity[]): Promise<void> {
    if (isEmpty(events)) return;
    const tenantId = this.requireTenantId();
    for (const e of events) {
      if (e.tenantId !== tenantId) {
        throw new Error(
          `AuditEventRepository.appendBatch: mixed tenantIds — expected ${tenantId}, got ${e.tenantId}`,
        );
      }
    }
    await this.repo.insert(events.map((e) => this.toOrm(e)));
  }

  async findById(id: string): Promise<AuditEventEntity | null> {
    const orm = await this.repo.findOne({
      where: this.scopedWhere({ id } as Partial<AuditEventOrmEntity>),
    });
    return orm ? this.toDomain(orm) : null;
  }

  async query(
    filter: AuditEventFilter,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<AuditEventEntity>> {
    const page = options.page ?? 1;
    const limit = Math.min(options.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const qb = this.scopedQb('ae').orderBy('ae.occurredAt', 'DESC').skip(skip).take(limit);

    if (filter.actorId) qb.andWhere('ae.actorId = :actorId', { actorId: filter.actorId });
    if (filter.action) qb.andWhere('ae.action = :action', { action: filter.action });
    if (filter.resourceType)
      qb.andWhere('ae.resourceType = :resourceType', { resourceType: filter.resourceType });
    if (filter.resourceId)
      qb.andWhere('ae.resourceId = :resourceId', { resourceId: filter.resourceId });
    if (filter.outcome) qb.andWhere('ae.outcome = :outcome', { outcome: filter.outcome });
    if (filter.fromDate && filter.toDate) {
      qb.andWhere('ae.occurredAt BETWEEN :from AND :to', {
        from: filter.fromDate,
        to: filter.toDate,
      });
    }

    const [data, total] = await qb.getManyAndCount();

    return {
      data: data.map((e) => this.toDomain(e)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  // ── Mapping ─────────────────────────────────────────────────────────────────

  private toDomain(orm: AuditEventOrmEntity): AuditEventEntity {
    return AuditEventEntity.reconstitute({
      auditEventId: orm.id,
      tenantId: orm.tenantId,
      actorId: orm.actorId,
      actorType: orm.actorType,
      action: orm.action,
      resourceType: orm.resourceType,
      resourceId: orm.resourceId,
      outcome: orm.outcome,
      metadata: orm.metadata,
      correlationId: orm.correlationId,
      ipAddress: orm.ipAddress,
      userAgent: orm.userAgent,
      occurredAt: orm.occurredAt,
    });
  }

  private toOrm(entity: AuditEventEntity): AuditEventOrmEntity {
    const orm = new AuditEventOrmEntity();
    orm.id = entity.auditEventId;
    orm.tenantId = entity.tenantId;
    orm.actorId = entity.actorId;
    orm.actorType = entity.actorType;
    orm.action = entity.action;
    orm.resourceType = entity.resourceType;
    orm.resourceId = entity.resourceId;
    orm.outcome = entity.outcome;
    orm.metadata = entity.metadata as Record<string, unknown>;
    orm.correlationId = entity.correlationId;
    orm.ipAddress = entity.ipAddress;
    orm.userAgent = entity.userAgent;
    orm.occurredAt = entity.occurredAt;
    return orm;
  }
}
