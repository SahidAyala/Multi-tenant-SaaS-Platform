# ATLAS Platform — Architecture Overview

## Platform Vision

ATLAS is an event-driven multi-tenant infrastructure platform designed to evolve into:
- Workflow orchestration platform
- Compliance automation platform  
- Internal developer platform
- Security operations platform

## Architecture Philosophy

```
Modular Monolith → Extraction-Ready Microservices
DDD Bounded Contexts → Clear service boundaries when extraction is warranted
Event-Driven Internal Communication → Transport-agnostic by design
Shared PostgreSQL → Schema isolation ready for Enterprise tier
```

## System Layers

```
┌─────────────────────────────────────────────────────────────┐
│                     HTTP Clients / APIs                      │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTPS
┌─────────────────────────▼───────────────────────────────────┐
│              ALB / API Gateway (future)                      │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                   ATLAS API (NestJS/Fastify)                  │
│  ┌─────────────┐ ┌──────────┐ ┌───────┐ ┌────────────────┐ │
│  │ Tenant Core │ │ Identity │ │ Audit │ │   Workflow     │ │
│  │  (DDD)      │ │  (DDD)   │ │ (DDD) │ │ Foundations    │ │
│  └─────────────┘ └──────────┘ └───────┘ └────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐│
│  │              Platform Events (IEventBus)                 ││
│  └──────────────────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────────┐│
│  │          Tenant Context (AsyncLocalStorage)              ││
│  └──────────────────────────────────────────────────────────┘│
└────────────────────────┬──────────────────┬─────────────────┘
                         │                  │
          ┌──────────────▼──┐    ┌──────────▼──────────┐
          │   PostgreSQL 16  │    │   Redis 7            │
          │ (Primary Store)  │    │ (Event Bus + Cache)  │
          └─────────────────┘    └─────────────────────┘
```

## Bounded Contexts

### 1. Tenant Core
- **Aggregate**: `OrganizationAggregate`
- **Entities**: Organization, Project, TenantMembership
- **Responsibilities**: Tenant lifecycle, provisioning, project management
- **Key Events**: `tenant.created`, `tenant.provisioned`, `tenant.suspended`

### 2. Identity & Access
- **Aggregate**: `UserAggregate`
- **Entities**: User, ApiKey, Role
- **Responsibilities**: AuthN/AuthZ, JWT tokens, API keys, RBAC
- **Key Events**: `identity.user.registered`, `identity.apikey.generated`, `identity.role.assigned`

### 3. Audit Engine
- **Entity**: `AuditEventEntity` (append-only, no aggregate — immutable by design)
- **Responsibilities**: Immutable audit trail, compliance queries, event replay
- **Key Events**: `audit.event.recorded`

### 4. Workflow Foundations
- **Entities**: `WorkflowDefinitionEntity`, `WorkflowExecutionEntity`
- **Responsibilities**: Workflow registration, execution metadata, event hooks
- **Key Events**: `workflow.execution.triggered`, `workflow.execution.completed`

### 5. Platform Events (Cross-cutting)
- Not a domain — infrastructure module
- Provides `IEventBus` for all modules
- Adapters: InMemory (dev) → Redis Streams → NATS → Kafka

## Request Lifecycle

```
1. HTTP Request arrives at Fastify
2. TenantContextMiddleware extracts x-tenant-id, sets AsyncLocalStorage
3. CorrelationIdInterceptor assigns/forwards x-correlation-id
4. JwtAuthGuard validates JWT, enriches TenantContext with actorId
5. RbacGuard checks role against required roles decorator
6. Controller receives request, constructs Command/Query
7. Handler executes business logic on domain aggregate
8. Aggregate emits domain events
9. Handler publishes integration events to IEventBus
10. Audit module listener records audit event
11. Response returned with x-correlation-id and x-request-id headers
```

## Data Model Summary

```
organizations (tenant root)
  ├── projects (owned by organization)
  ├── tenant_memberships (user → org with role)
  └── api_keys (scoped to org)

users (global identity, cross-tenant)

audit_events (immutable, tenant_id indexed)

workflow_definitions (tenant-scoped)
  └── workflow_executions (tenant-scoped, links to definition)
```

## Security Architecture

- **JWT**: Short-lived access (15m) + long-lived refresh (7d)
- **API Keys**: Hashed at rest, prefix-only displayed after creation
- **RBAC**: Owner > Admin > Member > Viewer hierarchy
- **Tenant Isolation**: tenant_id on all tenant-scoped tables + RLS
- **Audit**: All mutations generate immutable audit events
- **Transport**: TLS termination at ALB, internal traffic on private subnets
