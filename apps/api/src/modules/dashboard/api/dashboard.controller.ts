import { Controller, Get, UseGuards } from '@nestjs/common';
import { MembershipRole } from '@atlas/shared-kernel';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';

import { GetDashboardMetricsHandler } from '../application/queries/get-metrics/get-metrics.handler';
import { GetDashboardMetricsQuery } from '../application/queries/get-metrics/get-metrics.query';
import { GetEventSeriesHandler } from '../application/queries/get-event-series/get-event-series.handler';
import { GetEventSeriesQuery } from '../application/queries/get-event-series/get-event-series.query';

/**
 * Read-only dashboard endpoints powering the operator UI overview screen.
 *
 * Authorization: VIEWER role is the floor — any authenticated tenant member
 * may read aggregated metrics for their own tenant. Tenant scoping is enforced
 * inside each handler via TenantContextService (ALS), not from request input.
 */
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles(MembershipRole.VIEWER)
export class DashboardController {
  constructor(
    private readonly getMetrics: GetDashboardMetricsHandler,
    private readonly getEventSeries: GetEventSeriesHandler,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Get('metrics')
  async metrics() {
    const data = await this.getMetrics.execute(
      new GetDashboardMetricsQuery({
        tenantId: this.tenantContext.tenantId,
        correlationId: this.tenantContext.correlationId,
      }),
    );
    return { data };
  }

  @Get('event-series')
  async eventSeries() {
    const data = await this.getEventSeries.execute(
      new GetEventSeriesQuery({
        tenantId: this.tenantContext.tenantId,
        correlationId: this.tenantContext.correlationId,
      }),
    );
    return { data };
  }
}
