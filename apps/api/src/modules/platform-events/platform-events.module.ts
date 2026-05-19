import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EVENT_BUS_PORT } from './ports/event-bus.port';
import { InMemoryEventBus } from './adapters/in-memory.event-bus';
import { RedisStreamsEventBus } from './adapters/redis-streams.event-bus';

@Module({})
export class PlatformEventsModule {
  static forRoot(): DynamicModule {
    return {
      module: PlatformEventsModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: EVENT_BUS_PORT,
          useFactory: (configService: ConfigService) => {
            const adapter = configService.get<string>('eventBus.adapter', 'memory');
            if (adapter === 'redis-streams') {
              return new RedisStreamsEventBus(configService);
            }
            return new InMemoryEventBus();
          },
          inject: [ConfigService],
        },
      ],
      exports: [EVENT_BUS_PORT],
      global: true,
    };
  }
}
