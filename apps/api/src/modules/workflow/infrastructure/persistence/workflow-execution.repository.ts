import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedRepository, buildPaginationMeta, isUndefined } from '@atlas/shared-kernel';
import { TenantContextService } from '../../../../common/tenant-context/tenant-context.service';
import {
  WorkflowExecutionRepositoryPort,
  WorkflowExecutionListFilters,
} from '../../domain/repositories/workflow-execution.repository.port';
import {
  WorkflowExecutionEntity,
  WorkflowExecutionProps,
} from '../../domain/entities/workflow-execution.entity';
import { WorkflowExecutionOrmEntity } from './workflow-execution.orm-entity';
import { PaginatedResult, PaginationOptions } from '@atlas/shared-kernel';

@Injectable()
export class WorkflowExecutionRepository
  extends TenantScopedRepository<WorkflowExecutionOrmEntity>
  implements WorkflowExecutionRepositoryPort
{
  constructor(
    @InjectRepository(WorkflowExecutionOrmEntity)
    repo: Repository<WorkflowExecutionOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<WorkflowExecutionEntity | null> {
    const orm = await this.repo.findOne({
      where: this.scopedWhere({ id } as Partial<WorkflowExecutionOrmEntity>),
    });
    return orm ? this.toDomain(orm) : null;
  }

  async findByDefinition(
    definitionId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<WorkflowExecutionEntity>> {
    const page = options.page ?? 1;
    const limit = Math.min(options.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const [orms, total] = await this.scopedQb('we')
      .andWhere('we.definitionId = :definitionId', { definitionId })
      .orderBy('we.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: orms.map((o) => this.toDomain(o)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async findMany(
    filters: WorkflowExecutionListFilters,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<WorkflowExecutionEntity>> {
    const page = options.page ?? 1;
    const limit = Math.min(options.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.scopedQb('we');
    if (!isUndefined(filters.status)) {
      qb.andWhere('we.status = :status', { status: filters.status });
    }

    const [orms, total] = await qb
      .orderBy('we.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: orms.map((o) => this.toDomain(o)),
      meta: buildPaginationMeta(page, limit, total),
    };
  }

  async save(execution: WorkflowExecutionEntity): Promise<WorkflowExecutionEntity> {
    this.guardTenantOwnership(execution.tenantId);
    const orm = this.toOrm(execution);
    const saved = await this.repo.save(orm);
    return this.toDomain(saved);
  }

  // ── Mapping ─────────────────────────────────────────────────────────────────

  private toDomain(orm: WorkflowExecutionOrmEntity): WorkflowExecutionEntity {
    return WorkflowExecutionEntity.reconstitute({
      executionId: orm.id,
      definitionId: orm.definitionId,
      tenantId: orm.tenantId,
      correlationId: orm.correlationId,
      triggeredBy: orm.triggeredBy,
      triggerType: orm.triggerType as WorkflowExecutionProps['triggerType'],
      input: orm.input,
      status: orm.status,
      stepResults: orm.stepResults,
      startedAt: orm.startedAt,
      completedAt: orm.completedAt,
      durationMs: orm.durationMs,
      errorMessage: orm.errorMessage ?? undefined,
      createdAt: orm.createdAt,
    });
  }

  private toOrm(entity: WorkflowExecutionEntity): WorkflowExecutionOrmEntity {
    const orm = new WorkflowExecutionOrmEntity();
    orm.id = entity.executionId;
    orm.definitionId = entity.definitionId;
    orm.tenantId = entity.tenantId;
    orm.correlationId = entity.correlationId;
    orm.triggeredBy = entity.triggeredBy;
    orm.triggerType = entity.triggerType;
    orm.input = entity.input as Record<string, unknown>;
    orm.status = entity.status;
    orm.stepResults = entity.stepResults as WorkflowExecutionOrmEntity['stepResults'];
    orm.startedAt = entity.startedAt;
    orm.completedAt = entity.completedAt;
    orm.durationMs = entity.durationMs;
    orm.errorMessage = entity.errorMessage;
    return orm;
  }
}
