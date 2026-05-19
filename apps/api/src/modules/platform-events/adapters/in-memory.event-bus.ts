import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { TenantAwareEvent } from '@atlas/event-contracts';
import { IEventBus, IEventHandler } from '../ports/event-bus.port';

/**
 * In-memory event bus for local development and unit testing.
 * No persistence, no ordering guarantees beyond call order.
 * Handlers run synchronously in the same process.
 *
 * NOT suitable for production — domain events are lost on restart.
 */
@Injectable()
export class InMemoryEventBus implements IEventBus, OnModuleDestroy {
  private readonly logger = new Logger(InMemoryEventBus.name);
  private readonly handlers = new Map<string, IEventHandler[]>();

  async publish(event: TenantAwareEvent): Promise<void> {
    const eventHandlers = this.handlers.get(event.eventType) ?? [];
    if (eventHandlers.length === 0) {
      this.logger.debug(`No handlers registered for event type: ${event.eventType}`);
      return;
    }

    this.logger.debug(`Publishing ${event.eventType} [tenantId=${event.tenantId}, correlationId=${event.correlationId}]`);

    for (const handler of eventHandlers) {
      try {
        await handler.handle(event);
      } catch (err) {
        this.logger.error(
          `Handler '${handler.handlerName}' failed for event '${event.eventType}': ${(err as Error).message}`,
          (err as Error).stack,
        );
        // In-memory bus continues despite handler failure — production bus should use DLQ
      }
    }
  }

  async publishBatch(events: TenantAwareEvent[]): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }

  async subscribe(eventType: string, handler: IEventHandler): Promise<void> {
    const existing = this.handlers.get(eventType) ?? [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
    this.logger.debug(`Registered handler '${handler.handlerName}' for event '${eventType}'`);
  }

  async unsubscribe(eventType: string, handlerName: string): Promise<void> {
    const existing = this.handlers.get(eventType) ?? [];
    const filtered = existing.filter((h) => h.handlerName !== handlerName);
    this.handlers.set(eventType, filtered);
  }

  onModuleDestroy(): void {
    this.handlers.clear();
  }
}
