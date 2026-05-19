# ADR-006: Tenant Repository Isolation Strategy

**Status:** Accepted  
**Date:** 2026-05-18  
**Authors:** Platform Engineering  
**Deciders:** Architecture Review

---

## Context

ATLAS is a multi-tenant SaaS platform. All tenant data lives in a single shared
PostgreSQL schema, isolated by a `tenant_id` UUID column on every tenant-scoped
table. The initial repository implementations contained a critical flaw: most
queries **did not filter by `tenant_id`**, relying on handlers to always pass the
correct ID manually.

This is the exact failure mode that causes cross-tenant data leaks in production:

```typescript
// Before: handler must remember to pass tenantId — easy to forget
const org = await this.orgRepo.findById(id);            // ← no tenant check
const events = await this.auditRepo.findById(id, tenantId); // ← explicit but fragile
```

ATLAS already propagates tenant context through the entire request lifecycle via
`AsyncLocalStorage` (see ADR-004). The repository layer was not leveraging this.

The goal is a repository architecture that:
- **Prevents** cross-tenant queries by default
- **Requires** explicit, auditable justification for any bypass
- **Stays simple** — domain repositories remain domain-oriented, not generic
- **Supports future evolution** to schema-per-tenant or database-per-tenant

---

## Decision

Introduce two abstract base classes in `@atlas/shared-kernel` and a
`SystemQueryContext` value object. Every repository chooses the base class that
matches its entity's relationship to the tenant concept.

### Entity Categories

| Category | Entity | Base Class | Mechanism |
|----------|--------|------------|-----------|
| Tenant-scoped | `audit_events`, `workflow_definitions`, `workflow_executions` | `TenantScopedRepository<E>` | Reads `tenantId` from ALS; injects into every query |
| Tenant-root | `organizations` | `TenantRootRepository<E>` | Org's `id` IS the `tenantId`; guards equality |
| Global | `users` | None (plain TypeORM) | Cross-tenant by design; users authenticate globally |

### Core Infrastructure

#### `ITenantContextPort` (shared-kernel)

A thin interface that decouples the base class from NestJS and from the concrete
`TenantContextService`. This makes repositories unit-testable without a running
DI container:

```typescript
interface ITenantContextPort {
  readonly tenantId: string;
  tryGetTenantId(): string | undefined;
  isInitialized(): boolean;
}
```

#### `TenantScopedRepository<E extends { tenantId: string }>`

```typescript
// Safe, automatic query — tenantId resolved from ALS
async findById(id: string): Promise<AuditEventEntity | null> {
  const orm = await this.repo.findOne({
    where: this.scopedWhere({ id }),      // → { id, tenantId: '<from ALS>' }
  });
  return orm ? this.toDomain(orm) : null;
}

// Safe, automatic QueryBuilder
async query(filter: AuditEventFilter): Promise<PaginatedResult<AuditEventEntity>> {
  const qb = this.scopedQb('ae')         // → WHERE ae.tenant_id = '<from ALS>'
    .andWhere('ae.action = :action', { action: filter.action })
    .orderBy('ae.occurredAt', 'DESC');
  const [data, total] = await qb.getManyAndCount();
  // ...
}

// Write-path safety — catches bugs where entity has wrong tenantId
async append(event: AuditEventEntity): Promise<AuditEventEntity> {
  this.guardTenantOwnership(event.tenantId); // throws ForbiddenException on mismatch
  await this.repo.insert(this.toOrm(event));
  return event;
}
```

#### `TenantRootRepository<E>`

The org entity's primary key IS the tenantId — there is no separate column to
filter on. Instead, we assert that the requested ID equals the active tenant:

```typescript
async findById(id: string): Promise<OrganizationAggregate | null> {
  this.guardTenantRoot(id);   // throws if id !== tenantContext.tenantId
  return this.repo.findOne({ where: { id } });
}
```

#### `SystemQueryContext`

Cross-tenant access requires an explicit value object that names the type and
reason of the bypass. It is a compile-time and code-review forcing function:

```typescript
// Production usage — provisioning handler
const ctx = SystemQueryContext.forProvisioning(CreateOrganizationHandler.name);
const exists = await this.orgRepo.existsBySlug(slug, ctx);
const saved  = await this.orgRepo.provision(org, ctx);

// Production usage — super-admin support tool
const ctx = SystemQueryContext.forSuperAdmin(adminId, 'Investigating customer report #4821');
const org = await this.orgRepo.findBySlug('acme-corp', ctx);

// Production usage — event consumer without ALS context
const ctx = SystemQueryContext.forEventConsumer(event.eventType, event.eventId);
const definitions = await this.wfDefRepo.findByTriggerEventSystem(event.eventType, ctx);
```

`grep SystemQueryContext` in any codebase shows every tenant boundary bypass
instantly — making security audits trivial.

---

## Request Lifecycle

```
HTTP Request
  │
  ├── TenantContextMiddleware
  │     Reads x-tenant-id header → stores { tenantId, correlationId, ... }
  │     in AsyncLocalStorage
  │
  ├── JWT Guard
  │     Enriches ALS context with { actorId, actorType }
  │
  ├── Handler (e.g., TriggerWorkflowHandler)
  │     Constructs command from request body
  │     Calls repository.findById(id)     ← NO tenantId param
  │
  ├── WorkflowDefinitionRepository.findById(id)
  │     extends TenantScopedRepository
  │     calls this.requireTenantId()      ← reads from ALS
  │     executes: WHERE id = ? AND tenant_id = ?
  │
  └── Response
```

---

## Event Consumer Tenant Resolution

Event consumers receive events that carry their own `tenantId` in the payload.
Because consumers run outside HTTP request context (no ALS), they must:

1. Extract `tenantId` from the event payload
2. Wrap processing in `tenantContextService.run(context, fn)` to establish ALS
3. Use `SystemQueryContext.forEventConsumer(...)` only for methods that cross tenants

```typescript
@Injectable()
export class WorkflowEventConsumer implements OnModuleInit {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly wfDefRepo: WorkflowDefinitionRepositoryPort,
  ) {}

  async onTenantCreated(event: TenantCreatedEvent): Promise<void> {
    // Establish ALS context from event payload — same mechanism as HTTP middleware
    await this.tenantContext.run(
      {
        tenantId: event.tenantId,
        correlationId: event.correlationId,
        requestId: event.eventId,
        actorId: event.actorId,
        actorType: 'system',
        timestamp: new Date(event.occurredAt),
      },
      async () => {
        // Now repositories work identically to HTTP request handlers
        const definitions = await this.wfDefRepo.findByTriggerEvent(TENANT_CREATED);
        for (const def of definitions) {
          await this.triggerWorkflow(def);
        }
      },
    );
  }
}
```

---

## DI Registration Pattern

Repositories are singletons (NestJS default). Tenant isolation is per-call, not
per-instance — the base class reads from ALS at query time, not at construction
time. This avoids the high overhead of request-scoped repositories:

```typescript
// Module registration — no change from pre-existing pattern
@Module({
  imports: [TypeOrmModule.forFeature([AuditEventOrmEntity])],
  providers: [
    { provide: AUDIT_EVENT_REPOSITORY, useClass: AuditEventRepository },
  ],
})
export class AuditModule {}
```

The constructor injection pattern for all tenant-aware repos:

```typescript
@Injectable()
export class AuditEventRepository
  extends TenantScopedRepository<AuditEventOrmEntity>
  implements AuditEventRepositoryPort
{
  constructor(
    @InjectRepository(AuditEventOrmEntity) repo: Repository<AuditEventOrmEntity>,
    tenantContext: TenantContextService,   // @Global() — no module import needed
  ) {
    super(repo, tenantContext);
  }
}
```

---

## Safe vs Unsafe Patterns

### SAFE ✅

```typescript
// Automatic scoping via scopedWhere
const orm = await this.repo.findOne({ where: this.scopedWhere({ id }) });

// Automatic scoping via scopedQb
const orms = await this.scopedQb('ae')
  .andWhere('ae.action = :action', { action })
  .getMany();

// Write-path ownership guard
this.guardTenantOwnership(entity.tenantId);
await this.repo.save(orm);

// Explicit system context for provisioning
const ctx = SystemQueryContext.forProvisioning(HandlerName);
await this.orgRepo.existsBySlug(slug, ctx);
```

### UNSAFE ❌ — do not write these

```typescript
// No tenant scope — leaks all tenants' data
const orm = await this.repo.findOne({ where: { id } });

// Manually passed tenantId — forgotten under pressure
const orm = await this.repo.findOne({ where: { id, tenantId: command.tenantId } });

// Unfiltered QueryBuilder — full table scan across tenants
const orms = await this.repo.createQueryBuilder('ae').getMany();

// systemQb without ctx — would not compile (ctx is required)
// this.systemQb('ae'); ← TypeScript error: missing argument
```

---

## Testing Strategy

### Unit testing repositories

Mock `ITenantContextPort` — no NestJS, no database required:

```typescript
function makeTenantContext(tenantId: string): ITenantContextPort {
  return {
    get tenantId() { return tenantId; },
    tryGetTenantId: () => tenantId,
    isInitialized: () => true,
  };
}

it('scopes findById to tenant', async () => {
  const mockRepo = createMock<Repository<AuditEventOrmEntity>>();
  const ctx = makeTenantContext('tenant-a');

  const repo = new AuditEventRepository(mockRepo, ctx);
  await repo.findById('event-1');

  expect(mockRepo.findOne).toHaveBeenCalledWith({
    where: { id: 'event-1', tenantId: 'tenant-a' },
  });
});

it('throws when no tenant context', async () => {
  const mockRepo = createMock<Repository<AuditEventOrmEntity>>();
  const ctx: ITenantContextPort = {
    get tenantId(): string { throw new Error('no context'); },
    tryGetTenantId: () => undefined,
    isInitialized: () => false,
  };

  const repo = new AuditEventRepository(mockRepo, ctx);
  await expect(repo.findById('event-1')).rejects.toThrow('no active tenant context');
});

it('rejects mismatched tenantId on write', async () => {
  const mockRepo = createMock<Repository<AuditEventOrmEntity>>();
  const ctx = makeTenantContext('tenant-a');
  const repo = new AuditEventRepository(mockRepo, ctx);

  const event = buildAuditEvent({ tenantId: 'tenant-b' }); // wrong tenant
  await expect(repo.append(event)).rejects.toThrow('Tenant isolation violation');
});
```

### Integration testing

Use `TenantContextService.run()` to wrap test transactions in a real tenant
context before calling repository methods. Each test should use a distinct
`tenantId` UUID to prevent cross-test contamination.

---

## Performance Considerations

- **Singleton repositories** — ALS reads are O(1) with no allocation per request.
  Request-scoped repositories were considered and rejected: they create a new
  class instance per HTTP request, multiplied across all modules.

- **Index coverage** — every `tenant_id` column is part of a composite index:
  `(tenant_id, occurred_at)`, `(tenant_id, action)`, etc. Scoped queries hit
  these indexes and never scan cross-tenant data.

- **Prepared statements** — TypeORM's QueryBuilder uses parameterized queries.
  `tenantId` is always a bound parameter, never interpolated, preventing both
  SQL injection and query plan fragmentation.

---

## Migration Path: Shared-Schema → Schema-per-Tenant → DB-per-Tenant

The architecture was designed to support future isolation models without
rewriting domain repositories.

### Phase 1 (current): Shared schema, tenant_id column isolation

No changes required from today's state.

### Phase 2: Schema-per-tenant (PostgreSQL `search_path`)

Override `requireTenantId()` in a new `SchemaAwareTenantRepository` subclass:

```typescript
protected requireTenantId(): string {
  const tenantId = super.requireTenantId();
  // Set search_path so all unqualified table references resolve to this tenant's schema
  await this.dataSource.query(`SET search_path TO tenant_${tenantId}, public`);
  return tenantId;
}
```

Domain repositories extend `SchemaAwareTenantRepository` instead of
`TenantScopedRepository` — no method bodies change.

### Phase 3: Database-per-tenant

Introduce a `TenantDataSourceResolver` that maps `tenantId → DataSource`:

```typescript
interface TenantDataSourceResolver {
  resolve(tenantId: string): Promise<DataSource>;
}
```

Override the `repo` getter in the base class to fetch the tenant-specific
DataSource and return its `Repository<E>`:

```typescript
protected get scopedRepo(): Repository<E> {
  const ds = await this.dataSourceResolver.resolve(this.requireTenantId());
  return ds.getRepository(this.entityClass);
}
```

Domain repositories call `this.scopedRepo.findOne(...)` instead of
`this.repo.findOne(...)`. This is a one-line change per method — the WHERE
clauses disappear because the database itself is the isolation boundary.

In all three phases, the **domain repository ports are unchanged**. Handlers,
commands, and queries do not know which isolation model is active.

---

## Consequences

### Positive

- **Zero cross-tenant queries by default.** A repository method without
  `SystemQueryContext` cannot read data outside the active tenant.
- **Auditable escapes.** Every bypass has a named type, requester, and reason.
  `grep SystemQueryContext` finds all of them.
- **Testable.** `ITenantContextPort` is mockable without NestJS.
- **No performance penalty.** Singletons + ALS reads are cheaper than
  request-scoped instances.
- **No magic.** No TypeORM subscribers, no query interceptors, no decorators
  that silently modify queries. All scoping is visible in the call chain.

### Negative / Trade-offs

- **Constructor arity increases.** Each tenant-aware repository takes an
  additional `tenantContext: TenantContextService` parameter. This is a minor
  ergonomic cost with high safety return.
- **Base class coupling.** Domain repositories depend on `TenantScopedRepository`
  from `@atlas/shared-kernel`. If the shared kernel changes its base class API,
  all repositories need updating. Mitigated by keeping the base class surface
  minimal (four methods).
- **Provisioning requires SystemQueryContext.** Developers creating new tenant-
  provisioning flows must remember to construct a `SystemQueryContext`. The
  compiler enforces this — method signatures won't compile without it.

---

## Alternatives Considered

### TypeORM global query filter (`@EntitySubscriber`)

Rejected. TypeORM's event subscribers run at ORM level and are globally
registered. They cannot read from `AsyncLocalStorage` cleanly in all execution
contexts (event consumers, migrations, scheduled jobs). Bypassing them requires
disabling the subscriber entirely, not wrapping it in an explicit context object.
The implicit behavior makes cross-tenant queries harder to audit, not easier.

### Request-scoped repositories (NestJS `Scope.REQUEST`)

Rejected. NestJS request-scoped providers create a new instance for every
request, including all their transitive dependencies. In a busy service this
causes GC pressure and slows cold-path latency. ALS achieves the same "per-
request context" goal with singleton instances.

### Passing `tenantId` as an explicit parameter to every method

Rejected. This is the original (broken) design. It is fragile because nothing
prevents a developer from passing the wrong tenantId, forgetting it entirely, or
reusing an ID from a different source (e.g., a path parameter instead of the
verified JWT claim).

### Single `TenantAwareRepository` with both scoped and root methods

Considered. Having one base class reduces the taxonomy but creates a leaky
abstraction: `scopedWhere` makes no sense for `OrganizationRepository` (no
tenantId column), and `guardTenantRoot` makes no sense for `AuditEventRepository`.
Two focused base classes are clearer and prevent misuse.
