import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditEventOrmEntity } from '../../../../audit/infrastructure/persistence/audit-event.orm-entity';
import { WorkflowExecutionOrmEntity } from '../../../../workflow/infrastructure/persistence/workflow-execution.orm-entity';
import { OrganizationOrmEntity } from '../../../../tenant-core/infrastructure/persistence/organization.orm-entity';
import { TenantContextService } from '../../../../../common/tenant-context/tenant-context.service';
import { GetDashboardMetricsQuery } from './get-metrics.query';

export interface DashboardMetricsResult {
  readonly totalEvents: number;
  readonly activeWorkflows: number;
  readonly failedExecutions: number;
  readonly tenantCount: number;
  readonly eventsTrend: number;
  readonly failedTrend: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Returns aggregated KPIs for the current tenant.
 *
 * Tenant isolation: every per-tenant aggregate is filtered explicitly by
 * `tenantId` resolved from {@link TenantContextService} (AsyncLocalStorage).
 * `tenantCount` is intentionally NOT tenant-scoped — it is a platform-wide
 * statistic exposed for operational visibility.
 */
@Injectable()
export class GetDashboardMetricsHandler {
  constructor(
    @InjectRepository(AuditEventOrmEntity)
    private readonly auditRepo: Repository<AuditEventOrmEntity>,
    @InjectRepository(WorkflowExecutionOrmEntity)
    private readonly executionRepo: Repository<WorkflowExecutionOrmEntity>,
    @InjectRepository(OrganizationOrmEntity)
    private readonly organizationRepo: Repository<OrganizationOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(_query: GetDashboardMetricsQuery): Promise<DashboardMetricsResult> {
    const tenantId = this.tenantContext.tenantId;

    const now = new Date();
    const last24hStart = new Date(now.getTime() - DAY_MS);
    const prev24hStart = new Date(now.getTime() - 2 * DAY_MS);

    const [
      totalEvents,
      activeWorkflows,
      failedExecutionsLast24h,
      failedExecutionsPrev24h,
      tenantCount,
      eventsLast24h,
      eventsPrev24h,
    ] = await Promise.all([
      this.auditRepo.count({ where: { tenantId } }),
      this.executionRepo
        .createQueryBuilder('we')
        .where('we.tenantId = :tenantId', { tenantId })
        .andWhere('we.status IN (:...statuses)', { statuses: ['running', 'pending'] })
        .getCount(),
      this.executionRepo
        .createQueryBuilder('we')
        .where('we.tenantId = :tenantId', { tenantId })
        .andWhere('we.status = :status', { status: 'failed' })
        .andWhere('we.createdAt >= :from', { from: last24hStart })
        .getCount(),
      this.executionRepo
        .createQueryBuilder('we')
        .where('we.tenantId = :tenantId', { tenantId })
        .andWhere('we.status = :status', { status: 'failed' })
        .andWhere('we.createdAt >= :from', { from: prev24hStart })
        .andWhere('we.createdAt < :to', { to: last24hStart })
        .getCount(),
      this.organizationRepo.count(),
      this.auditRepo
        .createQueryBuilder('ae')
        .where('ae.tenantId = :tenantId', { tenantId })
        .andWhere('ae.occurredAt >= :from', { from: last24hStart })
        .getCount(),
      this.auditRepo
        .createQueryBuilder('ae')
        .where('ae.tenantId = :tenantId', { tenantId })
        .andWhere('ae.occurredAt >= :from', { from: prev24hStart })
        .andWhere('ae.occurredAt < :to', { to: last24hStart })
        .getCount(),
    ]);

    return {
      totalEvents,
      activeWorkflows,
      failedExecutions: failedExecutionsLast24h,
      tenantCount,
      eventsTrend: this.percentChange(eventsLast24h, eventsPrev24h),
      failedTrend: this.percentChange(failedExecutionsLast24h, failedExecutionsPrev24h),
    };
  }

  /** ((current - previous) / max(previous, 1)) * 100, rounded to 1 decimal. */
  private percentChange(current: number, previous: number): number {
    const denominator = Math.max(previous, 1);
    const raw = ((current - previous) / denominator) * 100;
    return Math.round(raw * 10) / 10;
  }
}
