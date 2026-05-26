/**
 * ATLAS Platform — Initial Platform Administrator Bootstrap
 * ----------------------------------------------------------
 * Provisions the first organization (tenant) and the first platform admin
 * user that owns it. Intended for fresh-install / local-dev seeding only —
 * NOT wired into runtime startup.
 *
 * How it works
 *  1. Boots the Nest application context (no HTTP listener) so DI resolves.
 *  2. Resolves the domain repository ports for users and organizations.
 *  3. Idempotently creates the org via `OrganizationRepositoryPort.provision()`
 *     using a `SystemQueryContext` — a tenant context does not yet exist.
 *  4. Idempotently creates the user via `UserRepositoryPort`, then activates
 *     the aggregate (skipping email verification — local-dev only).
 *  5. Re-runs are safe: if either entity already exists it is reused; if both
 *     already match the requested config the script exits 0 with no writes.
 *
 * Authorization model
 *  Until a persisted Memberships table is introduced, the "platform admin"
 *  role is expressed via the organization's `ownerId` FK. The bootstrap user
 *  is set as the org owner, which the RBAC guard interprets as
 *  `MembershipRole.OWNER` (the highest tier) when issuing JWTs.
 *
 * Tenant isolation
 *  This script intentionally operates outside any tenant context — that's
 *  why every cross-tenant repository call carries an explicit
 *  `SystemQueryContext.forProvisioning(...)` token. Standard tenant-scoped
 *  read/write paths are NOT used.
 *
 * Required environment variables
 *   INITIAL_ADMIN_EMAIL
 *   INITIAL_ADMIN_PASSWORD
 *   INITIAL_ADMIN_NAME
 *   INITIAL_TENANT_NAME
 *
 * Usage
 *   pnpm bootstrap:admin                     # via package.json script
 *   ./scripts/bootstrap-platform-admin.sh    # via shell wrapper
 *   make bootstrap                           # via Makefile target
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  MembershipRole,
  SystemQueryContext,
  TenantPlanTier,
  generateId,
  isNil,
} from '@atlas/shared-kernel';

import { AppModule } from '../apps/api/src/app.module';
import { UserRepositoryPort } from '../apps/api/src/modules/identity/domain/repositories/user.repository.port';
import { UserAggregate } from '../apps/api/src/modules/identity/domain/aggregates/user.aggregate';
import { OrganizationRepositoryPort } from '../apps/api/src/modules/tenant-core/domain/repositories/organization.repository.port';
import { OrganizationAggregate } from '../apps/api/src/modules/tenant-core/domain/aggregates/organization.aggregate';

// ── Env loading ─────────────────────────────────────────────────────────────

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: false });

interface BootstrapConfig {
  adminEmail: string;
  adminPassword: string;
  adminName: string;
  tenantName: string;
  tenantSlug: string;
  planTier: TenantPlanTier;
}

function readConfig(): BootstrapConfig {
  const adminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim();
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD;
  const adminName = process.env.INITIAL_ADMIN_NAME?.trim();
  const tenantName = process.env.INITIAL_TENANT_NAME?.trim();

  const missing: string[] = [];
  if (isNil(adminEmail) || adminEmail.length === 0) missing.push('INITIAL_ADMIN_EMAIL');
  if (isNil(adminPassword) || adminPassword.length === 0) missing.push('INITIAL_ADMIN_PASSWORD');
  if (isNil(adminName) || adminName.length === 0) missing.push('INITIAL_ADMIN_NAME');
  if (isNil(tenantName) || tenantName.length === 0) missing.push('INITIAL_TENANT_NAME');

  if (missing.length > 0) {
    throw new Error(
      `[bootstrap] Missing required environment variables: ${missing.join(', ')}. ` +
        `Copy .env.example to .env and fill them in, or export them in your shell.`,
    );
  }

  return {
    adminEmail: adminEmail!,
    adminPassword: adminPassword!,
    adminName: adminName!,
    tenantName: tenantName!,
    tenantSlug: slugify(tenantName!),
    planTier:
      (process.env.INITIAL_TENANT_PLAN as TenantPlanTier | undefined) ?? TenantPlanTier.ENTERPRISE,
  };
}

/**
 * Derive a TenantSlug-compatible value from a free-form tenant name.
 * Lowercase, alphanumerics + hyphen, no leading/trailing hyphen, length 3-63.
 */
function slugify(input: string): string {
  const explicit = process.env.INITIAL_TENANT_SLUG?.trim().toLowerCase();
  if (!isNil(explicit) && explicit.length >= 3) return explicit;

  let s = input
    .toLowerCase()
    .normalize('NFKD')
    // Strip combining diacritical marks (U+0300–U+036F).
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (s.length < 3) s = `${s}-org`;
  if (s.length > 63) s = s.slice(0, 63).replace(/-+$/g, '');
  return s;
}

// ── Bootstrap logic ─────────────────────────────────────────────────────────

interface BootstrapOutcome {
  organizationId: string;
  organizationCreated: boolean;
  userId: string;
  userCreated: boolean;
  ownerLinked: boolean;
}

async function provisionOrganization(
  repo: OrganizationRepositoryPort,
  cfg: BootstrapConfig,
  ownerId: string,
  logger: Logger,
): Promise<{ organizationId: string; created: boolean }> {
  const ctx = SystemQueryContext.forProvisioning('PlatformAdminBootstrap');

  const existing = await repo.findBySlug(cfg.tenantSlug, ctx);
  if (!isNil(existing)) {
    logger.log(
      `Organization '${cfg.tenantSlug}' already exists (id=${existing.organizationId}, status=${existing.status}) — reusing.`,
    );
    return { organizationId: existing.organizationId, created: false };
  }

  const org = OrganizationAggregate.create({
    name: cfg.tenantName,
    slug: cfg.tenantSlug,
    planTier: cfg.planTier,
    ownerId,
    correlationId: generateId(),
  });

  // Move the new org straight to ACTIVE — there is no async provisioning
  // pipeline in local-dev/bootstrap mode.
  org.markProvisioned(generateId(), generateId());

  const saved = await repo.provision(org, ctx);
  logger.log(`Organization provisioned: ${saved.organizationId} (slug=${saved.slug.value})`);

  // Domain events are intentionally NOT republished via the integration bus
  // here — bootstrap is a closed administrative action, not a tenant-driven
  // workflow. If we ever need cross-system bootstrap signals, route them
  // through the outbox explicitly.
  saved.clearDomainEvents();

  return { organizationId: saved.organizationId, created: true };
}

async function provisionAdminUser(
  repo: UserRepositoryPort,
  cfg: BootstrapConfig,
  logger: Logger,
): Promise<{ userId: string; created: boolean }> {
  const existing = await repo.findByEmail(cfg.adminEmail);
  if (!isNil(existing)) {
    logger.log(
      `Admin user '${cfg.adminEmail}' already exists (id=${existing.userId}, status=${existing.status}) — reusing.`,
    );
    return { userId: existing.userId, created: false };
  }

  const user = await UserAggregate.create({
    email: cfg.adminEmail,
    password: cfg.adminPassword,
    displayName: cfg.adminName,
  });

  // Bootstrap users skip the email-verification step. This is gated by env
  // (NODE_ENV !== 'production') at the top of run() — never auto-activate
  // a user against a production database.
  user.activate();

  const saved = await repo.save(user);
  logger.log(`Admin user created: ${saved.userId} (${saved.email.value})`);

  return { userId: saved.userId, created: true };
}

async function run(): Promise<BootstrapOutcome> {
  const logger = new Logger('Bootstrap');
  const cfg = readConfig();

  if (process.env.NODE_ENV === 'production' && process.env.BOOTSTRAP_ALLOW_PROD !== 'true') {
    throw new Error(
      '[bootstrap] Refusing to run with NODE_ENV=production. Set BOOTSTRAP_ALLOW_PROD=true to override (you almost certainly do not want this).',
    );
  }

  logger.log(`Bootstrapping platform admin '${cfg.adminEmail}' for tenant '${cfg.tenantName}' (slug=${cfg.tenantSlug})`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    // Quiet the normal startup noise; surface only bootstrap-specific output.
    logger: ['error', 'warn', 'log'],
  });

  try {
    const userRepo = app.get(UserRepositoryPort);
    const orgRepo = app.get(OrganizationRepositoryPort);

    // Order matters: organizations.owner_id has a NOT NULL FK → users.id,
    // so the admin user must be persisted before the org row is inserted.
    const userResult = await provisionAdminUser(userRepo, cfg, logger);
    const orgResult = await provisionOrganization(orgRepo, cfg, userResult.userId, logger);

    // Persisted memberships do not exist yet; the ownerId link IS the platform
    // admin assignment. Log it explicitly so the bootstrap output mentions the
    // logical role being granted.
    logger.log(
      `Role granted: ${MembershipRole.OWNER} (via organization.ownerId) — user=${userResult.userId} org=${orgResult.organizationId}`,
    );

    return {
      organizationId: orgResult.organizationId,
      organizationCreated: orgResult.created,
      userId: userResult.userId,
      userCreated: userResult.created,
      ownerLinked: true,
    };
  } finally {
    await app.close();
  }
}

run()
  .then((outcome) => {
    const userVerb = outcome.userCreated ? 'created' : 'reused';
    const orgVerb = outcome.organizationCreated ? 'provisioned' : 'reused';
    // eslint-disable-next-line no-console
    console.log(
      `\n[bootstrap] Done.\n` +
        `  Tenant ${orgVerb}: ${outcome.organizationId}\n` +
        `  Admin  ${userVerb}: ${outcome.userId}\n` +
        `  Status: ${outcome.organizationCreated || outcome.userCreated ? 'changes applied' : 'already up to date'}\n`,
    );
    process.exit(0);
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    // eslint-disable-next-line no-console
    console.error(`\n[bootstrap] Failed:\n${message}\n`);
    process.exit(1);
  });
