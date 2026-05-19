import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../../common/guards/rbac.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuditEventRepositoryPort } from '../domain/repositories/audit-event.repository.port';
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
  constructor(private readonly auditRepository: AuditEventRepositoryPort) {}

  @Get('events')
  async getAuditEvents(@Query() params: AuditQueryParams) {
    return this.auditRepository.query(
      {
        actorId: params.actorId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
      },
      { page: params.page, limit: params.limit },
    );
  }

  @Get('events/:id')
  async getAuditEvent(@Param('id') id: string) {
    return this.auditRepository.findById(id);
  }
}
