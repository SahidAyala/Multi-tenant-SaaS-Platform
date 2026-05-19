import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1716000000000 implements MigrationInterface {
  name = 'InitialSchema1716000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Enable extensions
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // -- Users (global, cross-tenant) --
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "email"             VARCHAR(320) NOT NULL UNIQUE,
        "password_hash"     VARCHAR(72) NOT NULL,
        "display_name"      VARCHAR(100) NOT NULL,
        "status"            VARCHAR(30) NOT NULL DEFAULT 'pending_verification',
        "last_login_at"     TIMESTAMPTZ,
        "email_verified_at" TIMESTAMPTZ,
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_users_email" ON "users" ("email")`);

    // -- Organizations (tenant root) --
    await queryRunner.query(`
      CREATE TYPE "tenant_status_enum" AS ENUM (
        'provisioning', 'active', 'suspended', 'deprovisioning', 'deleted'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "tenant_plan_tier_enum" AS ENUM (
        'free', 'starter', 'pro', 'enterprise'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id"             UUID PRIMARY KEY,
        "name"           VARCHAR(100) NOT NULL,
        "slug"           VARCHAR(63) NOT NULL UNIQUE,
        "plan_tier"      "tenant_plan_tier_enum" NOT NULL DEFAULT 'free',
        "status"         "tenant_status_enum" NOT NULL DEFAULT 'provisioning',
        "owner_id"       UUID NOT NULL REFERENCES "users" ("id"),
        "provisioned_at" TIMESTAMPTZ,
        "settings"       JSONB NOT NULL DEFAULT '{}',
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "idx_organizations_slug" ON "organizations" ("slug")`);

    // -- Audit Events (immutable, append-only) --
    await queryRunner.query(`
      CREATE TABLE "audit_events" (
        "id"             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenant_id"      UUID NOT NULL,
        "actor_id"       UUID,
        "actor_type"     VARCHAR(20) NOT NULL,
        "action"         VARCHAR(100) NOT NULL,
        "resource_type"  VARCHAR(100) NOT NULL,
        "resource_id"    VARCHAR(255) NOT NULL,
        "outcome"        VARCHAR(10) NOT NULL,
        "metadata"       JSONB NOT NULL DEFAULT '{}',
        "correlation_id" UUID NOT NULL,
        "ip_address"     INET,
        "user_agent"     TEXT,
        "occurred_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_audit_tenant_time" ON "audit_events" ("tenant_id", "occurred_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "idx_audit_tenant_action" ON "audit_events" ("tenant_id", "action")`);
    await queryRunner.query(`CREATE INDEX "idx_audit_tenant_actor" ON "audit_events" ("tenant_id", "actor_id")`);
    await queryRunner.query(`CREATE INDEX "idx_audit_tenant_resource" ON "audit_events" ("tenant_id", "resource_type", "resource_id")`);

    // Enforce immutability at DB level
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_update()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'audit_events are immutable: UPDATE/DELETE not allowed';
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER enforce_audit_immutability
        BEFORE UPDATE OR DELETE ON "audit_events"
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_update()
    `);

    // -- Workflow Definitions --
    await queryRunner.query(`
      CREATE TABLE "workflow_definitions" (
        "id"          UUID PRIMARY KEY,
        "tenant_id"   UUID NOT NULL,
        "name"        VARCHAR(100) NOT NULL,
        "description" TEXT,
        "trigger"     JSONB NOT NULL,
        "steps"       JSONB NOT NULL DEFAULT '[]',
        "version"     INTEGER NOT NULL DEFAULT 1,
        "status"      VARCHAR(20) NOT NULL DEFAULT 'draft',
        "created_by"  UUID NOT NULL,
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_workflow_def_tenant_status" ON "workflow_definitions" ("tenant_id", "status")`);

    // -- Workflow Executions --
    await queryRunner.query(`
      CREATE TABLE "workflow_executions" (
        "id"             UUID PRIMARY KEY,
        "definition_id"  UUID NOT NULL REFERENCES "workflow_definitions" ("id"),
        "tenant_id"      UUID NOT NULL,
        "correlation_id" UUID NOT NULL,
        "triggered_by"   VARCHAR(255) NOT NULL,
        "trigger_type"   VARCHAR(20) NOT NULL,
        "input"          JSONB NOT NULL DEFAULT '{}',
        "status"         VARCHAR(20) NOT NULL DEFAULT 'pending',
        "step_results"   JSONB NOT NULL DEFAULT '[]',
        "started_at"     TIMESTAMPTZ,
        "completed_at"   TIMESTAMPTZ,
        "duration_ms"    INTEGER,
        "error_message"  TEXT,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_workflow_exec_tenant_status" ON "workflow_executions" ("tenant_id", "status")`);
    await queryRunner.query(`CREATE INDEX "idx_workflow_exec_tenant_def" ON "workflow_executions" ("tenant_id", "definition_id")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_executions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_definitions"`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS enforce_audit_immutability ON "audit_events"`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_audit_update`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tenant_plan_tier_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "tenant_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
