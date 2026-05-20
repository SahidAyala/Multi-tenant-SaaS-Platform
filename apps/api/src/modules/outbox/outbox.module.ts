import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { OutboxEntryOrmEntity } from './infrastructure/persistence/outbox-entry.orm-entity';
import { OutboxEntryRepository } from './infrastructure/persistence/outbox-entry.repository';
import { OutboxEntryRepositoryPort } from './domain/repositories/outbox-entry.repository.port';
import { OutboxProcessorService } from './application/services/outbox-processor.service';
import { EventStreamingHttpClient } from '../platform-events/adapters/event-streaming-http.client';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEntryOrmEntity]), ConfigModule],
  providers: [
    { provide: OutboxEntryRepositoryPort, useClass: OutboxEntryRepository },
    EventStreamingHttpClient,
    OutboxProcessorService,
  ],
  exports: [OutboxEntryRepositoryPort],
})
export class OutboxModule {}
