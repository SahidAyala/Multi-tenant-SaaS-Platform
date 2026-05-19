# ADR-004: AsyncLocalStorage for Tenant Context Propagation

**Date:** 2026-05-18  
**Status:** Accepted  
**Deciders:** Platform Engineering

---

## Context

Every operation in ATLAS must be tenant-scoped. The naive approach passes `tenantId` as an explicit parameter through every function call:

```typescript
// Anti-pattern: tenantId pollution
async createProject(tenantId: string, name: string) {
  const org = await this.orgRepo.findById(id, tenantId); // tenantId everywhere
  const project = Project.create(name, tenantId);
  await this.auditService.record(tenantId, 'project.created', ...);
}
```

This leads to:
- Method signatures polluted with infrastructure concerns
- Easy to forget tenantId in a deep call chain
- Impossible to enforce at compile time

## Decision

Use **Node.js AsyncLocalStorage** to propagate tenant context as ambient state through the request lifecycle, without explicit parameter passing.

```
HTTP Request → TenantContextMiddleware
                → Sets TenantContextService.run({ tenantId, correlationId, actorId, ... })
                  → All async continuations within this request share the context
                  → Any code can call TenantContextService.getContext() to read it
```

The `TenantContextService` is globally available (marked `@Global()`). Domain services, repositories, and handlers read from it without receiving it as a parameter.

## Resolution Order

```
1. JWT sub-claim tenantId (trusted, cryptographically verified)
2. x-tenant-id header (only accepted on internal/system routes with additional auth)
```

## Consequences

**Positive:**
- Clean domain methods — no tenantId parameter pollution
- Impossible to forget tenant scoping (if context not set, throws immediately)
- correlationId and actorId flow through automatically for audit

**Negative:**
- "Magic" ambient state — less explicit than parameters
- Requires care in background jobs (must explicitly set context before async work)
- AsyncLocalStorage has slight overhead (~10ns per call, negligible)

## Background Job Pattern

```typescript
// Background jobs MUST set context explicitly
async processJob(job: Job) {
  await this.tenantContextService.run({
    tenantId: job.data.tenantId,
    correlationId: job.data.correlationId,
    actorId: 'system',
    actorType: 'system',
    requestId: uuidv4(),
    timestamp: new Date(),
  }, async () => {
    await this.doWork();
  });
}
```

This pattern is required for Bull queue workers, cron jobs, and event consumers.
