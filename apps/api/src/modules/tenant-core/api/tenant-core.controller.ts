import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser, TenantId } from '../../../common/tenant-context/tenant-id.decorator';
import { CreateOrganizationHandler } from '../application/commands/create-organization/create-organization.handler';
import { CreateOrganizationCommand } from '../application/commands/create-organization/create-organization.command';
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

@Controller('organizations')
@UseGuards(JwtAuthGuard, RbacGuard)
export class TenantCoreController {
  constructor(private readonly createOrganizationHandler: CreateOrganizationHandler) {}

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
}
