import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser, TenantId } from '../../../common/tenant-context/tenant-id.decorator';
import { MembershipRole } from '@atlas/shared-kernel';
import { ListWorkflowExecutionsHandler } from '../application/queries/list-executions/list-executions.handler';
import { ListWorkflowExecutionsQuery } from '../application/queries/list-executions/list-executions.query';
import { GetWorkflowExecutionHandler } from '../application/queries/get-execution/get-execution.handler';
import { GetWorkflowExecutionQuery } from '../application/queries/get-execution/get-execution.query';
import { CancelWorkflowExecutionHandler } from '../application/commands/cancel-execution/cancel-execution.handler';
import { CancelWorkflowExecutionCommand } from '../application/commands/cancel-execution/cancel-execution.command';
import { WorkflowExecutionStatus } from '../domain/entities/workflow-execution.entity';

const WORKFLOW_EXECUTION_STATUSES: WorkflowExecutionStatus[] = [
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
];

class ListExecutionsQueryParams {
  @IsOptional()
  @IsEnum(WORKFLOW_EXECUTION_STATUSES, {
    message: 'status must be one of: pending, running, completed, failed, cancelled',
  })
  status?: WorkflowExecutionStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

class CancelExecutionBody {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

@Controller('workflows')
@UseGuards(JwtAuthGuard, RbacGuard)
export class WorkflowController {
  constructor(
    private readonly listExecutionsHandler: ListWorkflowExecutionsHandler,
    private readonly getExecutionHandler: GetWorkflowExecutionHandler,
    private readonly cancelExecutionHandler: CancelWorkflowExecutionHandler,
  ) {}

  @Get('executions')
  @Roles(MembershipRole.MEMBER)
  async listExecutions(
    @Query() params: ListExecutionsQueryParams,
    @TenantId() tenantId: string,
    @CurrentUser() user: { correlationId: string },
  ) {
    const query = new ListWorkflowExecutionsQuery({
      tenantId,
      correlationId: user.correlationId,
      status: params.status,
      page: params.page,
      limit: params.limit,
    });

    const result = await this.listExecutionsHandler.execute(query);
    if (!result.success) throw result.error;
    return result.value;
  }

  @Get('executions/:id')
  @Roles(MembershipRole.MEMBER)
  async getExecution(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @CurrentUser() user: { correlationId: string },
  ) {
    const query = new GetWorkflowExecutionQuery({
      tenantId,
      correlationId: user.correlationId,
      executionId: id,
    });

    const result = await this.getExecutionHandler.execute(query);
    if (!result.success) throw result.error;
    return result.value;
  }

  @Post('executions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles(MembershipRole.ADMIN)
  async cancelExecution(
    @Param('id') id: string,
    @Body() body: CancelExecutionBody,
    @TenantId() tenantId: string,
    @CurrentUser() user: { sub: string; correlationId: string },
  ) {
    const command = new CancelWorkflowExecutionCommand({
      executionId: id,
      reason: body.reason,
      tenantId,
      correlationId: user.correlationId,
      actorId: user.sub,
    });

    const result = await this.cancelExecutionHandler.execute(command);
    if (!result.success) throw result.error;
    return result.value;
  }
}
