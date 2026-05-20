import { OutboxEntryEntity } from '../entities/outbox-entry.entity';

export abstract class OutboxEntryRepositoryPort {
  abstract append(entry: OutboxEntryEntity): Promise<void>;
  abstract findPending(limit: number): Promise<OutboxEntryEntity[]>;
  abstract save(entry: OutboxEntryEntity): Promise<void>;
}
