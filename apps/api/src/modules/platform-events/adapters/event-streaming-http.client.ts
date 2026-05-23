import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface IngestCommand {
  streamId: string;
  type: string;
  source: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, string>;
  correlationId: string;
  // Canonical envelope fields — forwarded as metadata so Event Streaming can
  // index them for cross-service correlation and causation-chain reconstruction.
  actorId?: string;
  causationId?: string;
  traceId?: string;
  sourceVersion?: string;
  eventVersion?: number;
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
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiToken}`,
        'X-Correlation-ID': command.correlationId,
      };
      // Propagate causation chain so Event Streaming can reconstruct it.
      if (command.causationId) headers['X-Causation-ID'] = command.causationId;
      if (command.traceId) headers['X-Trace-ID'] = command.traceId;

      // Merge caller-supplied metadata with canonical envelope fields so Event
      // Streaming receives the full causation chain without requiring a schema change.
      const metadata: Record<string, string> = {
        ...(command.metadata ?? {}),
        event_version: String(command.eventVersion ?? 1),
        source_service: command.source,
      };
      if (command.actorId) metadata['actor_id'] = command.actorId;
      if (command.causationId) metadata['causation_id'] = command.causationId;
      if (command.traceId) metadata['trace_id'] = command.traceId;
      if (command.sourceVersion) metadata['source_version'] = command.sourceVersion;

      const response = await fetch(`${this.baseUrl}/events`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          stream_id: command.streamId,
          type: command.type,
          source: command.source,
          payload: command.payload,
          metadata,
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
