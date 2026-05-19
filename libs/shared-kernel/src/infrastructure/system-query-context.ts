/**
 * Explicit authorization token for cross-tenant and system-level repository operations.
 *
 * Any repository method that bypasses tenant scoping MUST accept a SystemQueryContext
 * parameter. This makes cross-tenant access visible, searchable, and auditable at
 * code-review time — `grep SystemQueryContext` shows every bypass site.
 *
 * Construction is intentionally verbose: you must state WHY you need unscoped access.
 */
export const SYSTEM_CONTEXT_TYPE = {
  MIGRATION: 'migration',
  SCHEDULED_JOB: 'scheduled_job',
  SUPER_ADMIN: 'super_admin',
  PROVISIONING: 'provisioning',
  EVENT_CONSUMER: 'event_consumer',
  HEALTH_CHECK: 'health_check',
} as const;

export type SystemContextType = (typeof SYSTEM_CONTEXT_TYPE)[keyof typeof SYSTEM_CONTEXT_TYPE];

export class SystemQueryContext {
  private constructor(
    public readonly contextType: SystemContextType,
    public readonly reason: string,
    public readonly requester: string,
    public readonly createdAt: Date,
  ) {}

  /** Running a TypeORM migration that must touch all tenants. */
  static forMigration(migrationName: string): SystemQueryContext {
    return new SystemQueryContext(
      SYSTEM_CONTEXT_TYPE.MIGRATION,
      `Migration: ${migrationName}`,
      'TypeORM migrator',
      new Date(),
    );
  }

  /** A background/cron job processing data across tenants. */
  static forScheduledJob(jobName: string): SystemQueryContext {
    return new SystemQueryContext(
      SYSTEM_CONTEXT_TYPE.SCHEDULED_JOB,
      `Scheduled job: ${jobName}`,
      jobName,
      new Date(),
    );
  }

  /**
   * A super-admin performing an explicit cross-tenant operation.
   * Requires the admin's ID and an auditable reason string.
   */
  static forSuperAdmin(adminId: string, reason: string): SystemQueryContext {
    return new SystemQueryContext(
      SYSTEM_CONTEXT_TYPE.SUPER_ADMIN,
      reason,
      adminId,
      new Date(),
    );
  }

  /**
   * Tenant provisioning — used when creating a new org before any tenant context exists.
   * Caller is the handler class name for traceability.
   */
  static forProvisioning(handlerName: string): SystemQueryContext {
    return new SystemQueryContext(
      SYSTEM_CONTEXT_TYPE.PROVISIONING,
      `Tenant provisioning via ${handlerName}`,
      handlerName,
      new Date(),
    );
  }

  /**
   * An event consumer processing a domain event that carries its own tenantId.
   * The consumer resolves tenant context from the event payload rather than ALS.
   */
  static forEventConsumer(eventName: string, eventId: string): SystemQueryContext {
    return new SystemQueryContext(
      SYSTEM_CONTEXT_TYPE.EVENT_CONSUMER,
      `Processing ${eventName} [${eventId}]`,
      eventId,
      new Date(),
    );
  }

  /** Health/readiness checks that need a DB round-trip without a tenant. */
  static forHealthCheck(): SystemQueryContext {
    return new SystemQueryContext(
      SYSTEM_CONTEXT_TYPE.HEALTH_CHECK,
      'Health check',
      'health-check',
      new Date(),
    );
  }
}
