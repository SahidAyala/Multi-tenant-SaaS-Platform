import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IEventBus } from './ports/event-bus.port';
import { InMemoryEventBus } from './adapters/in-memory.event-bus';
import { RedisStreamsEventBus } from './adapters/redis-streams.event-bus';
import { ForwardingEventBus } from './adapters/forwarding.event-bus';
import { EventStreamingHttpClient } from './adapters/event-streaming-http.client';
import { OutboxEntryOrmEntity } from '../outbox/infrastructure/persistence/outbox-entry.orm-entity';
import { OutboxEntryRepository } from '../outbox/infrastructure/persistence/outbox-entry.repository';
import { OutboxEntryRepositoryPort } from '../outbox/domain/repositories/outbox-entry.repository.port';

@Module({})
export class PlatformEventsModule {
  /**
   * Wires the IEventBus provider according to configuration:
   *
   * EVENT_BUS_ADAPTER=memory      → InMemoryEventBus (dev/test, no forwarding)
   * EVENT_BUS_ADAPTER=redis-streams → RedisStreamsEventBus
   *
   * When EVENT_STREAMING_ENABLED=true the selected adapter is wrapped with
   * ForwardingEventBus, which additionally writes every published event to
   * outbox_entries for async forwarding to the Event Streaming backbone.
   */
  static forRoot(): DynamicModule {
    return {
      module: PlatformEventsModule,
      imports: [ConfigModule, TypeOrmModule.forFeature([OutboxEntryOrmEntity])],
      providers: [
        { provide: OutboxEntryRepositoryPort, useClass: OutboxEntryRepository },
        EventStreamingHttpClient,
        {
          provide: IEventBus,
          useFactory: (configService: ConfigService, outboxRepo: OutboxEntryRepositoryPort) => {
            const adapter = configService.get<string>('eventBus.adapter', 'memory');
            const forwardingEnabled = configService.get<boolean>('eventStreaming.enabled', false);

            let innerBus: IEventBus;
            if (adapter === 'redis-streams') {
              innerBus = new RedisStreamsEventBus(configService);
            } else {
              innerBus = new InMemoryEventBus();
            }

            if (forwardingEnabled) {
              return new ForwardingEventBus(innerBus, outboxRepo);
            }
            return innerBus;
          },
          inject: [ConfigService, OutboxEntryRepositoryPort],
        },
      ],
      exports: [IEventBus],
      global: true,
    };
  }
}
