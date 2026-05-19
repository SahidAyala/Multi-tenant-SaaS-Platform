import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantStatus, TenantPlanTier } from '@atlas/shared-kernel';

@Entity('organizations')
export class OrganizationOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ length: 100 })
  name!: string;

  @Index({ unique: true })
  @Column({ length: 63 })
  slug!: string;

  @Column({
    type: 'enum',
    enum: TenantPlanTier,
    default: TenantPlanTier.FREE,
  })
  planTier!: TenantPlanTier;

  @Column({
    type: 'enum',
    enum: TenantStatus,
    default: TenantStatus.PROVISIONING,
  })
  status!: TenantStatus;

  @Column('uuid')
  ownerId!: string;

  @Column({ type: 'timestamptz', nullable: true })
  provisionedAt?: Date;

  @Column({ type: 'jsonb', default: '{}' })
  settings!: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
