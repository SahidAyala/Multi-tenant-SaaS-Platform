import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditEventOrmEntity } from '../../../../audit/infrastructure/persistence/audit-event.orm-entity';
import { WorkflowExecutionOrmEntity } from '../../../../workflow/infrastructure/persistence/workflow-execution.orm-entity';
import { TenantContextService } from '../../../../../common/tenant-context/tenant-context.service';
import { GetEventSeriesQuery } from './get-event-series.query';

export interface EventSeriesPoint {
  readonly time: string;
  readonly events: number;
  readonly failures: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const SERIES_DAYS = 7;

interface DailyCountRow {
  day: string;
  count: string;
}

/**
 * Returns a 7-day daily time series of audit events and failed workflow
 * executions for the current tenant. Days with no rows are returned with
 * zero counts so the frontend always receives a contiguous 7-point series
 * (oldest first).
 *
 * Tenant isolation: both aggregations filter on `tenantId` resolved from
 * {@link TenantContextService}.
 */
@Injectable()
export class GetEventSeriesHandler {
  constructor(
    @InjectRepository(AuditEventOrmEntity)
    private readonly auditRepo: Repository<AuditEventOrmEntity>,
    @InjectRepository(WorkflowExecutionOrmEntity)
    private readonly executionRepo: Repository<WorkflowExecutionOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(_query: GetEventSeriesQuery): Promise<EventSeriesPoint[]> {
    const tenantId = this.tenantContext.tenantId;

    // Window: last 7 calendar days, starting at midnight UTC of (today - 6 days).
    const todayStartUtc = this.startOfUtcDay(new Date());
    const windowStart = new Date(todayStartUtc.getTime() - (SERIES_DAYS - 1) * DAY_MS);

    // NOTE: column references in raw SQL fragments below must match the actual
    // DB column names as declared by the TypeORM @Column decorators on the ORM
    // entities — NOT the snake_cased names used in migrations. AuditEventOrmEntity
    // declares `occurredAt` with no explicit `name:`, so TypeORM resolves the
    // column as `occurredAt`. WorkflowExecutionOrmEntity declares
    // `@CreateDateColumn({ name: 'created_at' })`, so its column is `created_at`.
    const [eventRows, failureRows] = await Promise.all([
      this.auditRepo
        .createQueryBuilder('ae')
        .select(`to_char(ae."occurredAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')`, 'day')
        .addSelect('COUNT(*)', 'count')
        .where('ae.tenantId = :tenantId', { tenantId })
        .andWhere('ae.occurredAt >= :from', { from: windowStart })
        .groupBy('day')
        .getRawMany<DailyCountRow>(),
      this.executionRepo
        .createQueryBuilder('we')
        .select(`to_char(we."created_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD')`, 'day')
        .addSelect('COUNT(*)', 'count')
        .where('we.tenantId = :tenantId', { tenantId })
        .andWhere('we.status = :status', { status: 'failed' })
        .andWhere('we.createdAt >= :from', { from: windowStart })
        .groupBy('day')
        .getRawMany<DailyCountRow>(),
    ]);

    const eventsByDay = this.indexByDay(eventRows);
    const failuresByDay = this.indexByDay(failureRows);

    const series: EventSeriesPoint[] = [];
    for (let i = 0; i < SERIES_DAYS; i++) {
      const day = new Date(windowStart.getTime() + i * DAY_MS);
      const key = this.formatDay(day);
      series.push({
        time: key,
        events: eventsByDay.get(key) ?? 0,
        failures: failuresByDay.get(key) ?? 0,
      });
    }

    return series;
  }

  private indexByDay(rows: DailyCountRow[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.day, Number(row.count));
    }
    return map;
  }

  private startOfUtcDay(d: Date): Date {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private formatDay(d: Date): string {
    const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
    const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const dd = d.getUTCDate().toString().padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
