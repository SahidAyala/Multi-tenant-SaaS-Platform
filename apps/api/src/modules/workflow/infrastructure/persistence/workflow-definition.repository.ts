import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedRepository } from '@atlas/shared-kernel';
import { TenantContextService } from '../../../../common/tenant-context/tenant-context.service';
import { WorkflowDefinitionRepositoryPort } from '../../domain/repositories/workflow-definition.repository.port';
import {
  WorkflowDefinitionEntity,
  WorkflowDefinitionProps,
} from '../../domain/entities/workflow-definition.entity';
import { WorkflowDefinitionOrmEntity } from './workflow-definition.orm-entity';

@Injectable()
export class WorkflowDefinitionRepository
  extends TenantScopedRepository<WorkflowDefinitionOrmEntity>
  implements WorkflowDefinitionRepositoryPort
{
  constructor(
    @InjectRepository(WorkflowDefinitionOrmEntity)
    repo: Repository<WorkflowDefinitionOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async findById(id: string): Promise<WorkflowDefinitionEntity | null> {
    const orm = await this.repo.findOne({
      where: this.scopedWhere({ id } as Partial<WorkflowDefinitionOrmEntity>),
    });
    return orm ? this.toDomain(orm) : null;
  }

  async findByTriggerEvent(eventType: string): Promise<WorkflowDefinitionEntity[]> {
    // trigger is a JSONB column: { type: 'event', eventType: '<value>' }
    const orms = await this.scopedQb('wd')
      .andWhere(`wd.trigger->>'type' = 'event'`)
      .andWhere(`wd.trigger->>'eventType' = :eventType`, { eventType })
      .andWhere(`wd.status = 'active'`)
      .getMany();
    return orms.map((o) => this.toDomain(o));
  }

  async save(definition: WorkflowDefinitionEntity): Promise<WorkflowDefinitionEntity> {
    this.guardTenantOwnership(definition.tenantId);
    const orm = this.toOrm(definition);
    const saved = await this.repo.save(orm);
    return this.toDomain(saved);
  }

  async existsById(id: string): Promise<boolean> {
    const count = await this.scopedQb('wd')
      .andWhere('wd.id = :id', { id })
      .getCount();
    return count > 0;
  }

  // ── Mapping ─────────────────────────────────────────────────────────────────

  private toDomain(orm: WorkflowDefinitionOrmEntity): WorkflowDefinitionEntity {
    return WorkflowDefinitionEntity.reconstitute({
      definitionId: orm.id,
      tenantId: orm.tenantId,
      name: orm.name,
      description: orm.description,
      trigger: orm.trigger,
      steps: orm.steps,
      version: orm.version,
      status: orm.status,
      createdBy: orm.createdBy,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    } as WorkflowDefinitionProps);
  }

  private toOrm(entity: WorkflowDefinitionEntity): WorkflowDefinitionOrmEntity {
    const orm = new WorkflowDefinitionOrmEntity();
    orm.id = entity.definitionId;
    orm.tenantId = entity.tenantId;
    orm.name = entity.name;
    orm.description = entity.description;
    orm.trigger = entity.trigger;
    orm.steps = entity.steps as WorkflowDefinitionOrmEntity['steps'];
    orm.version = entity.version;
    orm.status = entity.status;
    orm.createdBy = entity.createdBy;
    return orm;
  }
}
