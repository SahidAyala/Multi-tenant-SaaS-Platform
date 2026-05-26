import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkflowDefinitionStatus, WorkflowStep, WorkflowTrigger } from '../../domain/entities/workflow-definition.entity';

@Entity('workflow_definitions')
@Index(['tenantId', 'status'])
export class WorkflowDefinitionOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  tenantId!: string;

  @Column({ length: 100 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb' })
  trigger!: WorkflowTrigger;

  @Column({ type: 'jsonb', default: '[]' })
  steps!: WorkflowStep[];

  @Column({ default: 1 })
  version!: number;

  @Column({ type: 'varchar', length: 20, default: 'draft' })
  status!: WorkflowDefinitionStatus;

  @Column('uuid')
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
