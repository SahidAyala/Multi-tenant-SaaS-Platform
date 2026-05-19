import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { isNil, isEmpty } from '@atlas/shared-kernel';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { TenantAwareEvent } from '@atlas/event-contracts';
import { IEventBus, IEventHandler } from '../ports/event-bus.port';

/**
 * Redis Streams-backed event bus.
 *
 * Architecture:
 *  - Each event type gets its own stream: {prefix}{eventType}
 *  - Consumer groups allow multiple independent consumers (fan-out)
 *  - XACK after successful processing (at-least-once delivery)
 *  - Dead-letter stream for unprocessable events
 *  - MAXLEN trim prevents unbounded stream growth
 *
 * Extraction path: when separating into microservices, replace this adapter
 * with NATS JetStream or Kafka. The IEventBus interface is unchanged.
 */
@Injectable()
export class RedisStreamsEventBus extends IEventBus implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisStreamsEventBus.name);
  private readonly handlers = new Map<string, IEventHandler[]>();
  private readonly publisher: Redis;
  private readonly consumer: Redis;
  private readonly streamPrefix: string;
  private readonly consumerGroup: string;
  private readonly maxLen: number;
  private isConsuming = false;
  private consumeInterval?: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    const redisConfig = {
      host: this.configService.get('redis.host', 'localhost'),
      port: this.configService.get('redis.port', 6379),
      password: this.configService.get('redis.password'),
      db: this.configService.get('redis.db', 0),
    };
    this.publisher = new Redis(redisConfig);
    this.consumer = new Redis(redisConfig);
    this.streamPrefix = this.configService.get('eventBus.streamPrefix', 'atlas:events:');
    this.consumerGroup = this.configService.get('eventBus.consumerGroup', 'atlas-api');
    this.maxLen = this.configService.get('eventBus.maxLen', 10000);
  }

  async onModuleInit(): Promise<void> {
    this.startConsumeLoop();
  }

  async publish(event: TenantAwareEvent): Promise<void> {
    const streamKey = `${this.streamPrefix}${event.eventType}`;
    const fields = [
      'eventId', event.eventId,
      'eventType', event.eventType,
      'tenantId', event.tenantId,
      'correlationId', event.correlationId,
      'actorId', event.actorId ?? '',
      'occurredAt', event.occurredAt,
      'version', String(event.version),
      'payload', JSON.stringify(event.payload),
    ];

    await this.publisher.xadd(streamKey, 'MAXLEN', '~', this.maxLen, '*', ...fields);
    this.logger.debug(`Published ${event.eventType} to ${streamKey}`);
  }

  async publishBatch(events: TenantAwareEvent[]): Promise<void> {
    const pipeline = this.publisher.pipeline();
    for (const event of events) {
      const streamKey = `${this.streamPrefix}${event.eventType}`;
      const fields = [
        'eventId', event.eventId,
        'eventType', event.eventType,
        'tenantId', event.tenantId,
        'correlationId', event.correlationId,
        'occurredAt', event.occurredAt,
        'payload', JSON.stringify(event.payload),
      ];
      pipeline.xadd(streamKey, 'MAXLEN', '~', this.maxLen, '*', ...fields);
    }
    await pipeline.exec();
  }

  async subscribe(eventType: string, handler: IEventHandler): Promise<void> {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);

    const streamKey = `${this.streamPrefix}${eventType}`;
    try {
      await this.consumer.xgroup('CREATE', streamKey, this.consumerGroup, '$', 'MKSTREAM');
    } catch (_err) {
      // Consumer group already exists — expected on restart
    }
  }

  async unsubscribe(eventType: string, handlerName: string): Promise<void> {
    const existing = this.handlers.get(eventType) ?? [];
    this.handlers.set(eventType, existing.filter((h) => h.handlerName !== handlerName));
  }

  private startConsumeLoop(): void {
    this.isConsuming = true;
    this.consumeInterval = setInterval(() => void this.consumePendingMessages(), 100);
  }

  private async consumePendingMessages(): Promise<void> {
    for (const [eventType, handlers] of this.handlers.entries()) {
      if (isEmpty(handlers)) continue;
      const streamKey = `${this.streamPrefix}${eventType}`;

      try {
        const results = await this.consumer.xreadgroup(
          'GROUP', this.consumerGroup, 'atlas-api-1',
          'COUNT', '10',
          'BLOCK', '0',
          'STREAMS', streamKey, '>',
        ) as Array<[string, Array<[string, string[]]>]> | null;

        if (isNil(results)) continue;

        for (const [, messages] of results) {
          for (const [messageId, fields] of messages) {
            const event = this.deserializeEvent(fields);
            await this.dispatchToHandlers(event, handlers, streamKey, messageId);
          }
        }
      } catch (_err) {
        // Stream may not exist yet — harmless
      }
    }
  }

  private deserializeEvent(fields: string[]): TenantAwareEvent {
    const obj: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      obj[fields[i]] = fields[i + 1];
    }
    return {
      eventId: obj['eventId'],
      eventType: obj['eventType'],
      tenantId: obj['tenantId'],
      correlationId: obj['correlationId'],
      actorId: obj['actorId'] || undefined,
      occurredAt: obj['occurredAt'],
      version: parseInt(obj['version'] ?? '1', 10),
      payload: JSON.parse(obj['payload'] ?? '{}') as Record<string, unknown>,
    };
  }

  private async dispatchToHandlers(
    event: TenantAwareEvent,
    handlers: IEventHandler[],
    streamKey: string,
    messageId: string,
  ): Promise<void> {
    let allSucceeded = true;
    for (const handler of handlers) {
      try {
        await handler.handle(event);
      } catch (err) {
        allSucceeded = false;
        this.logger.error(
          `Handler '${handler.handlerName}' failed: ${(err as Error).message}`,
          (err as Error).stack,
        );
        await this.sendToDeadLetterStream(event, handler.handlerName, (err as Error).message);
      }
    }

    if (allSucceeded) {
      await this.consumer.xack(streamKey, this.consumerGroup, messageId);
    }
  }

  private async sendToDeadLetterStream(
    event: TenantAwareEvent,
    handlerName: string,
    errorMessage: string,
  ): Promise<void> {
    const dlqKey = `${this.streamPrefix}dlq`;
    await this.publisher.xadd(
      dlqKey, 'MAXLEN', '~', 1000, '*',
      'originalEvent', JSON.stringify(event),
      'handlerName', handlerName,
      'errorMessage', errorMessage,
      'failedAt', new Date().toISOString(),
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.isConsuming = false;
    if (this.consumeInterval) clearInterval(this.consumeInterval);
    await this.publisher.quit();
    await this.consumer.quit();
  }
}
