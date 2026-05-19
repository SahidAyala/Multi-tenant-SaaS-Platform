import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import {
  AuditEventRepositoryPort,
  AuditEventFilter,
} from '../../domain/repositories/audit-event.repository.port';
import { AuditEventEntity } from '../../domain/entities/audit-event.entity';
import { AuditEventOrmEntity } from './audit-event.orm-entity';
import {
  PaginatedResult,
  PaginationOptions,
  buildPaginationMeta,
} from '@atlas/shared-kernel';

@Injectable()
export class AuditEventRepository implements AuditEventRepositoryPort {
  constructor(
    @InjectRepository(AuditEventOrmEntity)
    private readonly repo: Repository<AuditEventOrmEntity>,
  ) {}

  async append(event: AuditEventEntity): Promise<AuditEventEntity> {
    const orm = this.toOrm(event);
    const saved = await this.repo.save(orm);
    return this.toDomain(saved);
  }

  async appendBatch(events: AuditEventEntity[]): Promise<void> {
    const ormEntities = events.map((e) => this.toOrm(e));
    await this.repo.insert(ormEntities);
  }

  async findById(id: string, tenantId: string): Promise<AuditEventEntity | null> {
    const orm = await this.repo.findOne({ where: { id, tenantId } });
    return orm ? this.toDomain(orm) : null;
  }

  async query(
    filter: AuditEventFilter,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<AuditEventEntity>> {
    const page = options.page ?? 1;
    const limit = Math.min(options.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<AuditEventOrmEntity> = { tenantId: filter.tenantId };
    if (filter.actorId) where.actorId = filter.actorId;
    if (filter.action) where.action = filter.action;
    if (filter.resourceType) where.resourceType = filter.resourceType;
    if (filter.resourceId) where.resourceId = filter.resourceId;
    if (filter.outcome) where.outcome = filter.outcome;
    if (filter.fromDate && filter.toDate) {
      where.occurredAt = Between(filter.fromDate, filter.toDate);
    }

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { occurredAt: 'DESC' },
      take: limit,
      skip,
    });

    return {
      data: data.map((e) => this.toDomain(e)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

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
