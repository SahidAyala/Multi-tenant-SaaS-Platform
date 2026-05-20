import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOutboxEntries1716500000000 implements MigrationInterface {
  name = 'AddOutboxEntries1716500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "outbox_status_enum" AS ENUM ('pending', 'processed', 'failed')
    `);

    await queryRunner.query(`
      CREATE TABLE "outbox_entries" (
        "id"             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "event_id"       UUID NOT NULL,
        "event_type"     VARCHAR(150) NOT NULL,
        "tenant_id"      UUID NOT NULL,
        "correlation_id" UUID NOT NULL,
        "payload"        JSONB NOT NULL DEFAULT '{}',
        "status"         outbox_status_enum NOT NULL DEFAULT 'pending',
        "attempts"       INTEGER NOT NULL DEFAULT 0,
        "last_error"     TEXT,
        "occurred_at"    TIMESTAMPTZ NOT NULL,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "processed_at"   TIMESTAMPTZ
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_outbox_status_created" ON "outbox_entries" ("status", "created_at")
      WHERE "status" = 'pending'
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_outbox_tenant_type" ON "outbox_entries" ("tenant_id", "event_type")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_outbox_event_id" ON "outbox_entries" ("event_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "outbox_entries"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "outbox_status_enum"`);
  }
}
