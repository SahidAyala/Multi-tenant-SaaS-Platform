import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxEntryRepositoryPort } from '../../domain/repositories/outbox-entry.repository.port';
import { EventStreamingHttpClient } from '../../../platform-events/adapters/event-streaming-http.client';

const POLL_INTERVAL_MS = 5_000;
const BATCH_SIZE = 50;
const MAX_ATTEMPTS = 5;

/**
 * Polls the outbox_entries table and forwards pending events to the Event Streaming backbone.
 * Runs on a fixed interval. On success the entry is marked processed; on failure the attempt
 * counter is incremented. After MAX_ATTEMPTS the entry is marked failed and requires manual
 * intervention (or a separate dead-letter sweep).
 */
@Injectable()
export class OutboxProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private readonly enabled: boolean;
  private pollTimer?: NodeJS.Timeout;

  constructor(
    private readonly outboxRepo: OutboxEntryRepositoryPort,
    private readonly eventStreamingClient: EventStreamingHttpClient,
    private readonly configService: ConfigService,
  ) {
    this.enabled = this.configService.get<boolean>('eventStreaming.enabled', false);
  }

  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.log('OutboxProcessor disabled (EVENT_STREAMING_ENABLED != true)');
      return;
    }
    this.pollTimer = setInterval(() => void this.processBatch(), POLL_INTERVAL_MS);
    this.logger.log('OutboxProcessor started');
  }

  onModuleDestroy(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private async processBatch(): Promise<void> {
    let entries;
    try {
      entries = await this.outboxRepo.findPending(BATCH_SIZE);
    } catch (err) {
      this.logger.error('OutboxProcessor: failed to fetch pending entries', (err as Error).message);
      return;
    }

    for (const entry of entries) {
      try {
        await this.eventStreamingClient.ingest({
          streamId: `platform.${entry.tenantId}.${entry.eventType}`,
          type: entry.eventType,
          source: 'atlas-saas-platform',
          payload: entry.payload,
          metadata: {
            event_id: entry.eventId,
            tenant_id: entry.tenantId,
            correlation_id: entry.correlationId,
          },
          correlationId: entry.correlationId,
        });
        entry.markProcessed();
        this.logger.debug(
          `OutboxProcessor: forwarded ${entry.eventType} [eventId=${entry.eventId}]`,
        );
      } catch (err) {
        entry.recordAttemptFailure((err as Error).message, MAX_ATTEMPTS);
        this.logger.warn(
          `OutboxProcessor: forward failed for ${entry.eventType} [eventId=${entry.eventId}, attempts=${entry.attempts}]`,
          (err as Error).message,
        );
      }

      try {
        await this.outboxRepo.save(entry);
      } catch (saveErr) {
        this.logger.error(
          `OutboxProcessor: failed to persist status update for outbox entry ${entry.outboxEntryId}`,
          (saveErr as Error).message,
        );
      }
    }
  }
}
