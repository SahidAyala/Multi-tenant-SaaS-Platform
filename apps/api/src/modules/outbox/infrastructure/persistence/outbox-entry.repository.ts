import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { OutboxEntryRepositoryPort } from '../../domain/repositories/outbox-entry.repository.port';
import { OutboxEntryEntity, OutboxEntryStatus } from '../../domain/entities/outbox-entry.entity';
import { OutboxEntryOrmEntity } from './outbox-entry.orm-entity';

@Injectable()
export class OutboxEntryRepository implements OutboxEntryRepositoryPort {
  constructor(
    @InjectRepository(OutboxEntryOrmEntity)
    private readonly repo: Repository<OutboxEntryOrmEntity>,
  ) {}

  async append(entry: OutboxEntryEntity): Promise<void> {
    await this.repo.insert(this.toOrm(entry));
  }

  async findPending(limit: number): Promise<OutboxEntryEntity[]> {
    const rows = await this.repo.find({
      where: { status: 'pending' as OutboxEntryStatus },
      order: { createdAt: 'ASC' },
      take: limit,
    });
    return rows.map((r) => this.toDomain(r));
  }

  async save(entry: OutboxEntryEntity): Promise<void> {
    await this.repo.save(this.toOrm(entry));
  }

  private toDomain(orm: OutboxEntryOrmEntity): OutboxEntryEntity {
    return OutboxEntryEntity.reconstitute({
      outboxEntryId: orm.id,
      eventId: orm.eventId,
      eventType: orm.eventType,
      tenantId: orm.tenantId,
      correlationId: orm.correlationId,
      payload: orm.payload,
      status: orm.status,
      attempts: orm.attempts,
      lastError: orm.lastError,
      occurredAt: orm.occurredAt,
      createdAt: orm.createdAt,
      processedAt: orm.processedAt,
    });
  }

  private toOrm(entity: OutboxEntryEntity): OutboxEntryOrmEntity {
    const orm = new OutboxEntryOrmEntity();
    orm.id = entity.outboxEntryId;
    orm.eventId = entity.eventId;
    orm.eventType = entity.eventType;
    orm.tenantId = entity.tenantId;
    orm.correlationId = entity.correlationId;
    orm.payload = entity.payload;
    orm.status = entity.status;
    orm.attempts = entity.attempts;
    orm.lastError = entity.lastError;
    orm.occurredAt = entity.occurredAt;
    orm.createdAt = entity.createdAt;
    orm.processedAt = entity.processedAt;
    return orm;
  }
}
