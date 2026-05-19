# ATLAS Platform — Implementation Roadmap

## Phase 0 — Foundation (COMPLETE in this commit)

The foundational architecture is initialized. All structural patterns are in place.

### What exists
- [x] Modular monolith structure (apps + libs)
- [x] Shared kernel (AggregateRoot, Entity, ValueObject, DomainEvent, Command, Query)
- [x] Event contracts library (all cross-domain event types)
- [x] Tenant context propagation (AsyncLocalStorage middleware)
- [x] Platform Events module (InMemory + Redis Streams adapters)
- [x] Tenant Core domain (Organization aggregate, provisioning lifecycle)
- [x] Identity domain (User aggregate, JWT strategy, RBAC guard)
- [x] Audit Engine (immutable AuditEvent entity, compliance queries)
- [x] Workflow Foundations (Definition + Execution entities, TriggerWorkflow command)
- [x] PostgreSQL + TypeORM setup with entity mapping
- [x] Domain exception hierarchy + global filter
- [x] Docker Compose for local development
- [x] Terraform modules (networking, RDS, ECS)
- [x] Initial database migration (schema + immutability trigger)
- [x] 5 Architecture Decision Records

---

## Phase 1 — Core Functionality (Next)

### Priority order

**1. Complete Tenant Provisioning Workflow**
- `ProvisionTenantCommand` + handler
- Create default `Project` for new organization
- `TenantMembership` entity + domain logic
- Event listener: `tenant.created` → trigger provisioning workflow
- Estimated: 2-3 days

**2. API Key System**
- `ApiKeyEntity` domain entity
- `GenerateApiKeyCommand` — create, hash, store prefix-only
- `ApiKeyRepository` with lookup-by-hash
- `ApiKeyGuard` full implementation (validate hash vs stored)
- Estimated: 1-2 days

**3. User Invitation Flow**
- `InviteUserCommand` — generate invitation token (hashed)
- `AcceptInvitationCommand` — validate token, create membership
- Email dispatch hook (interface only, plug in provider later)
- Estimated: 2 days

**4. Role Assignment**
- `AssignRoleCommand` — update TenantMembership role
- Project-level role assignments
- RBAC guard enhanced to check project roles
- Estimated: 1 day

**5. Audit Auto-Recording**
- NestJS interceptor or event listener that auto-records audit events for all mutations
- Configurable via `@Audit({ action: 'tenant.created' })` decorator
- Estimated: 1-2 days

---

## Phase 2 — Operational Readiness

- [ ] Structured logging (Pino via Fastify)
- [ ] OpenTelemetry traces (spans per command/query)
- [ ] Prometheus metrics endpoint (`/metrics`)
- [ ] Health checks (db + redis connectivity)
- [ ] Rate limiting per tenant (ThrottlerModule with tenant key)
- [ ] Request timeout middleware
- [ ] Graceful shutdown handling

---

## Phase 3 — Workflow Engine

- [ ] `WorkflowDefinitionRepository` implementation
- [ ] `WorkflowExecutionRepository` implementation
- [ ] Step executor (sequential, parallel, conditional)
- [ ] Event-triggered workflows (consume platform events → trigger definition)
- [ ] Retry logic with exponential backoff
- [ ] Webhook step type
- [ ] Schedule-based triggers (cron)

---

## Phase 4 — Security Hardening

- [ ] Row-level security (RLS) PostgreSQL policies
- [ ] JWT refresh token rotation + revocation (Redis set of revoked jti)
- [ ] API key scoping (permissions array enforcement in guard)
- [ ] MFA foundation (TOTP via authenticator apps)
- [ ] Cryptographic audit log chaining (hash chain on AuditEvent)
- [ ] IP allow-listing per tenant

---

## Phase 5 — Service Extraction Candidates

Per ADR-001, extract when scaling/isolation requirements emerge:

| Module | Extraction Trigger | Complexity |
|--------|--------------------|------------|
| Audit Engine | > 10K events/sec ingest | Low — clean boundary |
| Workflow Engine | Long-running executions block API threads | Medium — needs durable storage |
| Identity | SSO/SAML requirements | High — protocol complexity |
| Tenant Core | Enterprise isolation requirements | Medium |

### Extraction Process
1. Add NestJS microservice transport to existing module (TCP/Redis)
2. Verify event contracts cover all communication
3. Move module to separate app in monorepo
4. Separate CI/CD pipeline
5. (Optional) Move to separate repository when team size warrants

---

## Security Checklist (Before Production)

- [ ] Replace all default secrets in `.env.example` with strong values
- [ ] Enable RLS policies on all tenant-scoped tables
- [ ] Restrict database user permissions (no UPDATE on audit_events)
- [ ] Set `synchronize: false` in TypeORM config (already done)
- [ ] Enable TLS for database connections
- [ ] Configure AWS WAF on ALB
- [ ] Enable CloudTrail for all AWS API calls
- [ ] Set up VPC Flow Logs
- [ ] Rotate JWT secrets every 90 days
- [ ] Enable Multi-AZ RDS for production
