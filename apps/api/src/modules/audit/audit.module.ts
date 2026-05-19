import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEventOrmEntity } from './infrastructure/persistence/audit-event.orm-entity';
import { AuditEventRepository } from './infrastructure/persistence/audit-event.repository';
import { AuditEventRepositoryPort } from './domain/repositories/audit-event.repository.port';
import { RecordAuditEventHandler } from './application/commands/record-audit-event/record-audit-event.handler';
import { AuditController } from './api/audit.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AuditEventOrmEntity])],
  controllers: [AuditController],
  providers: [
    { provide: AuditEventRepositoryPort, useClass: AuditEventRepository },
    RecordAuditEventHandler,
  ],
  exports: [AuditEventRepositoryPort, RecordAuditEventHandler],
})
export class AuditModule {}
