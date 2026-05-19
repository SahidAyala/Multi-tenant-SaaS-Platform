import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { AuditActorType, AuditOutcome } from '../../domain/entities/audit-event.entity';

/**
 * No @UpdateDateColumn — audit events are immutable.
 * DB enforces this via a BEFORE UPDATE trigger that raises an exception.
 */
@Entity('audit_events')
@Index(['tenantId', 'occurredAt'])
@Index(['tenantId', 'action'])
@Index(['tenantId', 'actorId'])
@Index(['tenantId', 'resourceType', 'resourceId'])
export class AuditEventOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  tenantId!: string;

  @Column({ type: 'uuid', nullable: true })
  actorId?: string;

  @Column({ type: 'varchar', length: 20 })
  actorType!: AuditActorType;

  @Column({ length: 100 })
  action!: string;

  @Column({ name: 'resource_type', length: 100 })
  resourceType!: string;

  @Column({ name: 'resource_id', length: 255 })
  resourceId!: string;

  @Column({ type: 'varchar', length: 10 })
  outcome!: AuditOutcome;

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, unknown>;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId!: string;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;
}
