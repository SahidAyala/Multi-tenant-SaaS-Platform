import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditEventOrmEntity } from '../audit/infrastructure/persistence/audit-event.orm-entity';
import { WorkflowExecutionOrmEntity } from '../workflow/infrastructure/persistence/workflow-execution.orm-entity';
import { OrganizationOrmEntity } from '../tenant-core/infrastructure/persistence/organization.orm-entity';

import { DashboardController } from './api/dashboard.controller';
import { GetDashboardMetricsHandler } from './application/queries/get-metrics/get-metrics.handler';
import { GetEventSeriesHandler } from './application/queries/get-event-series/get-event-series.handler';

/**
 * Dashboard read-model module. Owns no aggregates — it composes lightweight
 * aggregates over ORM entities from existing bounded contexts (audit, workflow,
 * tenant-core) to power the operator overview UI.
 *
 * Cross-context coupling is intentionally limited to read-only TypeORM queries
 * against shared ORM entities; no domain objects from other modules are imported.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuditEventOrmEntity,
      WorkflowExecutionOrmEntity,
      OrganizationOrmEntity,
    ]),
  ],
  controllers: [DashboardController],
  providers: [GetDashboardMetricsHandler, GetEventSeriesHandler],
})
export class DashboardModule {}
