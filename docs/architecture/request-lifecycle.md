# ATLAS Platform — Request Lifecycle & Provisioning Flow

## Authenticated Request Lifecycle

```
Client                    ATLAS API                          Database    Redis
  │                           │                                │           │
  │── POST /v1/auth/login ───>│                                │           │
  │                           │── JwtAuthGuard (skip: @Public) │           │
  │                           │── CorrelationIdInterceptor     │           │
  │                           │    assigns x-correlation-id    │           │
  │                           │── TenantContextMiddleware      │           │
  │                           │    sets AsyncLocalStorage ctx  │           │
  │                           │                                │           │
  │                           │── AuthenticateHandler          │           │
  │                           │    ├─ findByEmail(email) ──────►           │
  │                           │    │                    <───────           │
  │                           │    ├─ verifyPassword()          │           │
  │                           │    ├─ recordLogin() ────────────►          │
  │                           │    └─ sign JWT tokens           │           │
  │                           │                                │           │
  │<── 200 { accessToken } ───│                                │           │
  │                           │                                │           │
  │                           │                                │           │
  │── GET /v1/organizations ─>│ (with Bearer token)            │           │
  │                           │── JwtAuthGuard validates JWT   │           │
  │                           │── enriches TenantContext       │           │
  │                           │    with actorId from JWT.sub   │           │
  │                           │── RbacGuard checks role        │           │
  │                           │── TenantCoreController         │           │
  │                           │    ├─ GetOrganizationQuery     │           │
  │                           │    └─ orgRepo.findById() ──────►           │
  │                           │                         <───────           │
  │<── 200 { organization } ──│                                │           │
```

## Tenant Provisioning Flow

This flow illustrates how a bounded context produces domain events that drive cross-context side effects via the event bus — without direct coupling.

```
Client                    Tenant Core              Event Bus        Audit
  │                           │                       │               │
  │── POST /v1/organizations ─►                        │               │
  │    { name, slug, plan }   │                        │               │
  │                           │ OrganizationAggregate  │               │
  │                           │  .create(...)          │               │
  │                           │  status: PROVISIONING  │               │
  │                           │  adds TenantCreatedDomainEvent         │
  │                           │                        │               │
  │                           │── orgRepo.save() ─────►DB              │
  │                           │                        │               │
  │                           │── eventBus.publish() ──►               │
  │                           │   (TenantCreatedEvent) │               │
  │                           │                        ├─ AuditListener│
  │                           │                        │   records:    │
  │                           │                        │   tenant.created
  │                           │                        │               ├─► audit_events
  │                           │                        │               │
  │                           │                        ├─ ProvisioningListener (future)
  │                           │                        │   triggers workflow: tenant-provisioning
  │                           │                        │               │
  │<── 201 { organizationId } ─                        │               │
```

## Domain Event → Integration Event Mapping

Domain events (internal to a bounded context) are translated to integration events (cross-context) at the application layer boundary:

```typescript
// In CreateOrganizationHandler:
for (const domainEvent of saved.domainEvents) {
  const integrationEvent: TenantCreatedEvent = {
    eventId: domainEvent.eventId,
    eventType: TENANT_CREATED,          // from @atlas/event-contracts
    tenantId: domainEvent.tenantId,
    correlationId: domainEvent.correlationId,
    payload: domainEvent.payload,
  };
  await this.eventBus.publish(integrationEvent);
}
saved.clearDomainEvents();
```

This separation means:
- Domain events can be rich internal objects with methods
- Integration events are plain serializable contracts
- Domain model changes don't break event consumers (versioning via `version` field)

## Error Propagation

```
Domain Exception thrown
  │
  ▼
DomainExceptionFilter.catch()
  │
  ├── NotFoundException → 404
  ├── ConflictException → 409
  ├── UnauthorizedException → 401
  ├── ForbiddenException → 403
  └── ValidationException → 422 { violations: {...} }

All responses include:
  { statusCode, code, message, correlationId, violations? }
```
