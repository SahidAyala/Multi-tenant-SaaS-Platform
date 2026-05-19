import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganizationOrmEntity } from './infrastructure/persistence/organization.orm-entity';
import { OrganizationRepository } from './infrastructure/persistence/organization.repository';
import { OrganizationMapper } from './infrastructure/persistence/organization.mapper';
import { OrganizationRepositoryPort } from './domain/repositories/organization.repository.port';
import { CreateOrganizationHandler } from './application/commands/create-organization/create-organization.handler';
import { TenantCoreController } from './api/tenant-core.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OrganizationOrmEntity])],
  controllers: [TenantCoreController],
  providers: [
    OrganizationMapper,
    { provide: OrganizationRepositoryPort, useClass: OrganizationRepository },
    CreateOrganizationHandler,
  ],
  exports: [OrganizationRepositoryPort],
})
export class TenantCoreModule {}
