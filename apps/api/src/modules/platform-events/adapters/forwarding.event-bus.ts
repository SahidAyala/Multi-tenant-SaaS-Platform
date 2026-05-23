import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TenantAwareEvent } from '@atlas/event-contracts';
import { IEventBus, IEventHandler } from '../ports/event-bus.port';
import { OutboxEntryRepositoryPort } from '../../outbox/domain/repositories/outbox-entry.repository.port';
import { OutboxEntryEntity } from '../../outbox/domain/entities/outbox-entry.entity';

/**
 * ForwardingEventBus wraps an inner IEventBus (Redis Streams or In-Memory) and additionally
 * writes every published event to the outbox_entries table.
 *
 * The OutboxProcessorService reads pending outbox entries and forwards them to the
 * Event Streaming backbone, providing at-least-once durability without coupling
 * the publish path to external HTTP availability.
 *
 * NOTE: The outbox write and the domain mutation are NOT in the same DB transaction here.
 * For strict transactional outbox semantics, domain handlers should write to the outbox
 * inside their own TypeORM transaction. This implementation provides a pragmatic default
 * where eventual consistency is acceptable — see ADR-008.
 */
@Injectable()
export class ForwardingEventBus extends IEventBus implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ForwardingEventBus.name);

  constructor(
    private readonly inner: IEventBus,
    private readonly outboxRepo: OutboxEntryRepositoryPort,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    if ('onModuleInit' in this.inner && typeof (this.inner as OnModuleInit).onModuleInit === 'function') {
      await (this.inner as OnModuleInit).onModuleInit();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if ('onModuleDestroy' in this.inner && typeof (this.inner as OnModuleDestroy).onModuleDestroy === 'function') {
      await (this.inner as OnModuleDestroy).onModuleDestroy();
    }
  }

  async publish(event: TenantAwareEvent): Promise<void> {
    await this.inner.publish(event);
    await this.writeToOutbox(event);
  }

  async publishBatch(events: TenantAwareEvent[]): Promise<void> {
    await this.inner.publishBatch(events);
    for (const event of events) {
      await this.writeToOutbox(event);
    }
  }

  async subscribe(eventType: string, handler: IEventHandler): Promise<void> {
    return this.inner.subscribe(eventType, handler);
  }

  async unsubscribe(eventType: string, handlerName: string): Promise<void> {
    return this.inner.unsubscribe(eventType, handlerName);
  }

  private async writeToOutbox(event: TenantAwareEvent): Promise<void> {
    try {
      const entry = OutboxEntryEntity.create({
        eventId: event.eventId,
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        tenantId: event.tenantId,
        correlationId: event.correlationId,
        actorId: event.actorId,
        causationId: event.causationId,
        traceId: event.traceId,
        sourceService: event.sourceService,
        sourceVersion: event.sourceVersion,
        payload: event.payload,
        occurredAt: new Date(event.occurredAt),
      });
      await this.outboxRepo.append(entry);
    } catch (err) {
      // Outbox write failure must not block the primary publish path.
      // The inner bus already accepted the event; the outbox is best-effort here.
      this.logger.error(
        `ForwardingEventBus: failed to write outbox entry for event ${event.eventId} (${event.eventType})`,
        (err as Error).message,
      );
    }
  }
}
