import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser, TenantId } from '../../../common/tenant-context/tenant-id.decorator';
import { CreateOrganizationHandler } from '../application/commands/create-organization/create-organization.handler';
import { CreateOrganizationCommand } from '../application/commands/create-organization/create-organization.command';
import { UpdateOrganizationHandler } from '../application/commands/update-organization/update-organization.handler';
import { UpdateOrganizationCommand } from '../application/commands/update-organization/update-organization.command';
import { SuspendOrganizationHandler } from '../application/commands/suspend-organization/suspend-organization.handler';
import { SuspendOrganizationCommand } from '../application/commands/suspend-organization/suspend-organization.command';
import { MembershipRole, TenantPlanTier } from '@atlas/shared-kernel';
import { IsEnum, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

class CreateOrganizationBody {
  @IsNotEmpty()
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsNotEmpty()
  @IsString()
  @Length(3, 63)
  slug!: string;

  @IsOptional()
  @IsEnum(TenantPlanTier)
  planTier?: TenantPlanTier;
}

class UpdateOrganizationBody {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsEnum(TenantPlanTier)
  planTier?: TenantPlanTier;
}

class SuspendOrganizationBody {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

@Controller('organizations')
@UseGuards(JwtAuthGuard, RbacGuard)
export class TenantCoreController {
  constructor(
    private readonly createOrganizationHandler: CreateOrganizationHandler,
    private readonly updateOrganizationHandler: UpdateOrganizationHandler,
    private readonly suspendOrganizationHandler: SuspendOrganizationHandler,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrganization(
    @Body() body: CreateOrganizationBody,
    @CurrentUser() user: { sub: string; correlationId: string },
  ) {
    const command = new CreateOrganizationCommand({
      name: body.name,
      slug: body.slug,
      planTier: body.planTier,
      tenantId: 'system',
      correlationId: user.correlationId,
      actorId: user.sub,
    });

    const result = await this.createOrganizationHandler.execute(command);
    if (!result.success) throw result.error;
    return result.value;
  }

  @Get(':id')
  @Roles(MembershipRole.VIEWER)
  async getOrganization(
    @Param('id') id: string,
    @TenantId() tenantId: string,
  ) {
    return { id, tenantId };
  }

  @Patch(':id')
  @Roles(MembershipRole.ADMIN)
  async updateOrganization(
    @Param('id') id: string,
    @Body() body: UpdateOrganizationBody,
    @TenantId() tenantId: string,
    @CurrentUser() user: { sub: string; correlationId: string },
  ) {
    const command = new UpdateOrganizationCommand({
      organizationId: id,
      name: body.name,
      planTier: body.planTier,
      tenantId,
      correlationId: user.correlationId,
      actorId: user.sub,
    });

    const result = await this.updateOrganizationHandler.execute(command);
    if (!result.success) throw result.error;
    return result.value;
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @Roles(MembershipRole.OWNER)
  async suspendOrganization(
    @Param('id') id: string,
    @Body() body: SuspendOrganizationBody,
    @TenantId() tenantId: string,
    @CurrentUser() user: { sub: string; correlationId: string },
  ) {
    const command = new SuspendOrganizationCommand({
      organizationId: id,
      reason: body.reason ?? 'No reason provided',
      tenantId,
      correlationId: user.correlationId,
      actorId: user.sub,
    });

    const result = await this.suspendOrganizationHandler.execute(command);
    if (!result.success) throw result.error;
    return result.value;
  }
}
