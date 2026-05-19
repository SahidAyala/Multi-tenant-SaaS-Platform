# ADR-002: Shared PostgreSQL with tenant_id Column Strategy

**Date:** 2026-05-18  
**Status:** Accepted  
**Deciders:** Platform Engineering

---

## Context

Multi-tenant data isolation can be achieved at three levels:

| Strategy | Isolation | Cost | Complexity |
|----------|-----------|------|------------|
| Separate database per tenant | Highest | High (connection per tenant) | High (provisioning, migrations) |
| Schema per tenant | Medium | Medium (pg schemas) | Medium (search_path management) |
| Shared schema + tenant_id | Lowest | Low (single pool) | Low (index strategy) |

ATLAS targets a shared-infrastructure, cost-optimized SaaS model initially.

## Decision

Use **shared PostgreSQL database with tenant_id column** on every tenant-scoped table.

Rules:
1. Every entity that belongs to a tenant MUST have `tenant_id UUID NOT NULL`
2. All queries MUST include `WHERE tenant_id = $1` — enforced at the repository layer
3. Every index on a tenant-scoped table MUST start with `tenant_id` (composite index)
4. Row-level security (RLS) policies added as defense-in-depth

```sql
-- Example RLS policy
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON audit_events
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

## Consequences

**Positive:**
- Simple connection pooling (single pool for all tenants)
- Easy migrations (apply once, affects all tenants)
- Low infrastructure cost
- Fast onboarding (no per-tenant provisioning for database)

**Negative:**
- Cross-tenant data leakage possible if application bug bypasses tenant_id filter
- Performance isolation not possible (noisy neighbor)
- Cannot offer customers dedicated database as a premium tier without architectural change

## Evolution Path

The `OrganizationAggregate.settings.dataIsolation` field is reserved for future:
- `shared`: current behavior
- `schema`: PostgreSQL schema per tenant (require search_path injection)
- `isolated`: separate RDS instance (provisioned on demand for Enterprise tier)

Domain code does not need to change for schema-level isolation. Only the TypeORM data source configuration and migration strategy changes.

## Enforcement

Repository port implementations MUST:
1. Always receive tenantId as a parameter
2. Always include tenant_id in WHERE clauses
3. Never return entities from other tenants

Enforced via code review + integration tests that verify no cross-tenant leakage.
