import { TenantAwareEvent } from '@atlas/event-contracts';

export interface IEventHandler<T extends TenantAwareEvent = TenantAwareEvent> {
  readonly handlerName: string;
  handle(event: T): Promise<void>;
}

/**
 * Event bus abstraction. Current implementations:
 *  - InMemoryEventBus: development/testing, synchronous, no persistence
 *  - RedisStreamsEventBus: production, at-least-once, persistent
 *
 * Future extraction path: replace with NATS JetStream or Kafka without
 * changing any domain or application code — only the adapter swaps.
 */
export abstract class IEventBus {
  abstract publish(event: TenantAwareEvent): Promise<void>;
  abstract publishBatch(events: TenantAwareEvent[]): Promise<void>;
  abstract subscribe(eventType: string, handler: IEventHandler): Promise<void>;
  abstract unsubscribe(eventType: string, handlerName: string): Promise<void>;
}
