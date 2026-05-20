import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface IngestCommand {
  streamId: string;
  type: string;
  source: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, string>;
  correlationId: string;
}

/**
 * HTTP client for the Event Streaming & Audit service ingest API.
 * Calls POST /events to append an event to the canonical event backbone.
 *
 * Auth: bearer token issued by Event Streaming's POST /auth/issue endpoint.
 * The token is static per deployment and stored in EVENT_STREAMING_API_TOKEN.
 */
@Injectable()
export class EventStreamingHttpClient {
  private readonly logger = new Logger(EventStreamingHttpClient.name);
  private readonly baseUrl: string;
  private readonly apiToken: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('eventStreaming.baseUrl', '');
    this.apiToken = this.configService.get<string>('eventStreaming.apiToken', '');
    this.timeoutMs = this.configService.get<number>('eventStreaming.timeoutMs', 5000);
  }

  async ingest(command: IngestCommand): Promise<void> {
    if (!this.baseUrl) {
      throw new Error('EVENT_STREAMING_BASE_URL is not configured');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiToken}`,
          'X-Correlation-ID': command.correlationId,
        },
        body: JSON.stringify({
          stream_id: command.streamId,
          type: command.type,
          source: command.source,
          payload: command.payload,
          metadata: command.metadata ?? {},
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Event Streaming ingest returned ${response.status}: ${body}`);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`Event Streaming ingest timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
