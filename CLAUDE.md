# ATLAS Platform — Claude Code Context

## Project Overview

ATLAS is an event-driven multi-tenant infrastructure platform built as a NestJS modular monolith with strong DDD boundaries, designed for future microservice extraction.

## Architecture

- **Pattern**: Modular monolith → extraction-ready microservices
- **Framework**: NestJS with Fastify adapter
- **Database**: PostgreSQL 16 (TypeORM), shared schema + tenant_id
- **Cache/Events**: Redis 7 (event bus + sessions)
- **IaC**: Terraform (AWS ECS/Fargate-ready)

## Bounded Contexts

| Module | Path | Responsibility |
|--------|------|----------------|
| Tenant Core | `apps/api/src/modules/tenant-core/` | Organizations, projects, memberships |
| Identity | `apps/api/src/modules/identity/` | Auth, users, API keys, RBAC |
| Audit | `apps/api/src/modules/audit/` | Immutable audit trail |
| Workflow | `apps/api/src/modules/workflow/` | Workflow definitions and execution |
| Platform Events | `apps/api/src/modules/platform-events/` | IEventBus abstraction |

## Shared Libraries

| Library | Path | Usage |
|---------|------|-------|
| `@atlas/shared-kernel` | `libs/shared-kernel/` | Base classes (AggregateRoot, Entity, ValueObject, DomainEvent) |
| `@atlas/event-contracts` | `libs/event-contracts/` | Typed cross-domain event interfaces |

## Key Architectural Rules

1. **Cross-module communication ONLY via IEventBus** — never import domain objects from other modules
2. **All tenant-scoped entities MUST have `tenantId`** — repository implementations always filter by it
3. **AuditEventEntity is append-only** — no update methods, DB enforces with trigger
4. **TenantContextService provides ambient context** — don't pass tenantId through every function
5. **Commands mutate state, Queries read** — handlers in `application/commands/` and `application/queries/`
6. **Domain events drive integration events** — emit from aggregate, translate to `TenantAwareEvent` in handler

## Coding Conventions

### File Naming
```
entity.entity.ts          # Domain entities
aggregate.aggregate.ts    # Domain aggregates
value-object.vo.ts        # Value objects
event.domain-event.ts     # Domain events
repository.port.ts        # Repository interfaces (domain layer)
repository.ts             # Repository implementations (infrastructure)
orm-entity.orm-entity.ts  # TypeORM entities
mapper.ts                 # Domain ↔ ORM mappers
command.command.ts        # Commands
command.handler.ts        # Command handlers
query.query.ts            # Queries
query.handler.ts          # Query handlers
```

### Adding a New Entity
1. Create domain entity in `domain/entities/`
2. Create TypeORM ORM entity in `infrastructure/persistence/`
3. Create mapper in `infrastructure/persistence/`
4. Create repository port (interface) in `domain/repositories/`
5. Create repository implementation in `infrastructure/persistence/`
6. Register in module `providers` + `TypeOrmModule.forFeature()`
7. Add to `AppModule` entity list
8. Create migration: `make migrate-generate NAME=Create<Entity>`

### Adding a New Event Type
1. Add payload interface + const to `libs/event-contracts/src/{domain}/`
2. Export from `libs/event-contracts/src/index.ts`
3. Add consumer subscription in the receiving module's `OnModuleInit`

## Common Commands

```bash
make dev              # Start infrastructure + API (watch mode)
make infra            # Start postgres + redis only
make test             # Run tests
make migrate          # Run migrations
make lint             # Lint code
```

## Environment

Copy `.env.example` → `.env`. All defaults work for Docker-based local dev.

Key toggles:
- `EVENT_BUS_ADAPTER=memory` (dev) vs `redis-streams` (staging/prod)
- `DB_LOGGING=true` to see SQL queries

## Architecture Decisions

See `docs/adr/` for the full ADR log:
- ADR-001: Modular monolith choice
- ADR-002: Shared PostgreSQL + tenant_id strategy
- ADR-003: Redis Streams event bus
- ADR-004: AsyncLocalStorage tenant context propagation
- ADR-005: Immutable audit log design
