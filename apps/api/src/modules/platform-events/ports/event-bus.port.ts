import { TenantAwareEvent } from '@atlas/event-contracts';

export const EVENT_BUS_PORT = Symbol('EVENT_BUS_PORT');

/**
 * Event bus abstraction. Current implementations:
 *  - InMemoryEventBus: development/testing, synchronous, no persistence
 *  - RedisStreamsEventBus: production, at-least-once, persistent
 *
 * Future extraction path: replace with NATS JetStream or Kafka without
 * changing any domain or application code — only the adapter swaps.
 */
export interface IEventBus {
  publish(event: TenantAwareEvent): Promise<void>;
  publishBatch(events: TenantAwareEvent[]): Promise<void>;
  subscribe(eventType: string, handler: IEventHandler): Promise<void>;
  unsubscribe(eventType: string, handlerName: string): Promise<void>;
}

export interface IEventHandler<T extends TenantAwareEvent = TenantAwareEvent> {
  readonly handlerName: string;
  handle(event: T): Promise<void>;
}
