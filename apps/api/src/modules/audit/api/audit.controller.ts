import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { TenantId } from '../../../common/tenant-context/tenant-id.decorator';
import { Inject } from '@nestjs/common';
import {
  AUDIT_EVENT_REPOSITORY,
  AuditEventRepositoryPort,
} from '../domain/repositories/audit-event.repository.port';
import { MembershipRole } from '@atlas/shared-kernel';
import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

class AuditQueryParams {
  @IsOptional() @IsString() actorId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() resourceType?: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @Transform(({ value }) => Number(value)) page?: number;
  @IsOptional() @Transform(({ value }) => Number(value)) limit?: number;
}

@Controller('audit')
@UseGuards(JwtAuthGuard, RbacGuard)
@Roles(MembershipRole.ADMIN)
export class AuditController {
  constructor(
    @Inject(AUDIT_EVENT_REPOSITORY)
    private readonly auditRepository: AuditEventRepositoryPort,
  ) {}

  @Get('events')
  async getAuditEvents(
    @TenantId() tenantId: string,
    @Query() params: AuditQueryParams,
  ) {
    return this.auditRepository.query(
      { tenantId, actorId: params.actorId, action: params.action, resourceType: params.resourceType },
      { page: params.page, limit: params.limit },
    );
  }

  @Get('events/:id')
  async getAuditEvent(
    @Param('id') id: string,
    @TenantId() tenantId: string,
  ) {
    return this.auditRepository.findById(id, tenantId);
  }
}
