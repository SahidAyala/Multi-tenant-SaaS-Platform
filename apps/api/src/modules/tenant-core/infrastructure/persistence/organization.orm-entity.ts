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
    name: 'plan_tier',
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

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @Column({ name: 'provisioned_at', type: 'timestamptz', nullable: true })
  provisionedAt?: Date;

  @Column({ type: 'jsonb', default: '{}' })
  settings!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
