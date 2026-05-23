import { Column, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { OutboxEntryStatus } from '../../domain/entities/outbox-entry.entity';

@Entity('outbox_entries')
@Index(['status', 'createdAt'])
@Index(['tenantId', 'eventType'])
// Idempotency: prevent the same platform event from being inserted twice into the
// outbox (e.g. if ForwardingEventBus is called twice for the same event).
// The unique constraint is on event_id — one outbox row per logical event ID.
@Unique('uq_outbox_entries_event_id', ['eventId'])
export class OutboxEntryOrmEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Column({ name: 'event_type', length: 150 })
  eventType!: string;

  // Schema/contract version of the event type. Distinct from the stream version
  // assigned by Event Streaming (which is a per-stream monotonic sequence number).
  @Column({ name: 'event_version', type: 'int', default: 1 })
  eventVersion!: number;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ name: 'correlation_id', type: 'uuid' })
  correlationId!: string;

  // actorId — who triggered the domain action (user UUID, "system", service name).
  @Column({ name: 'actor_id', type: 'text', nullable: true })
  actorId?: string;

  // causationId — eventId of the upstream event that caused this one.
  // Set when this event is produced as a reaction to another event.
  @Column({ name: 'causation_id', type: 'text', nullable: true })
  causationId?: string;

  // traceId — W3C/B3 distributed trace ID; propagated from HTTP headers when present.
  @Column({ name: 'trace_id', type: 'text', nullable: true })
  traceId?: string;

  @Column({ name: 'source_service', type: 'text', default: 'atlas-saas-platform' })
  sourceService!: string;

  @Column({ name: 'source_version', type: 'text', nullable: true })
  sourceVersion?: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: OutboxEntryStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt?: Date;
}
