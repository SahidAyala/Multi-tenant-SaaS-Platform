import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkflowExecutionStatus, WorkflowStepResult } from '../../domain/entities/workflow-execution.entity';

@Entity('workflow_executions')
@Index(['tenantId', 'status'])
@Index(['tenantId', 'definitionId'])
export class WorkflowExecutionOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  definitionId!: string;

  @Column('uuid')
  tenantId!: string;

  @Column('uuid')
  correlationId!: string;

  @Column({ length: 255 })
  triggeredBy!: string;

  @Column({ type: 'varchar', length: 20 })
  triggerType!: string;

  @Column({ type: 'jsonb', default: '{}' })
  input!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20 })
  status!: WorkflowExecutionStatus;

  @Column({ type: 'jsonb', default: '[]' })
  stepResults!: WorkflowStepResult[];

  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ type: 'integer', nullable: true })
  durationMs?: number;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
