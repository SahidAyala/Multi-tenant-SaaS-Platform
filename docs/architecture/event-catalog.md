# ATLAS Platform — Event Catalog

All events implement `TenantAwareEvent` (see `libs/event-contracts/src/base/tenant-aware-event.interface.ts`).

## Event Envelope (all events)

```typescript
{
  eventId: string;        // UUID, unique per event
  eventType: string;      // Namespaced string (see below)
  tenantId: string;       // Organization UUID (or 'global' for system events)
  correlationId: string;  // Traces a chain of cause/effect
  actorId?: string;       // User/API key that triggered this
  causationId?: string;   // eventId of the event that caused this
  occurredAt: string;     // ISO-8601
  version: number;        // Schema version (start at 1, increment on breaking change)
  payload: {...}          // Event-specific data
}
```

## Naming Convention

```
{domain}.{entity}.{verb}
domain:  tenant | identity | audit | workflow
entity:  organization | user | apikey | role | event | execution | definition
verb:    created | provisioned | suspended | registered | invited | generated | assigned | recorded | triggered | completed
```

---

## Tenant Events

### `tenant.created`
Emitted when a new organization is created (status: PROVISIONING).

```typescript
payload: {
  organizationId: string;
  name: string;
  slug: string;
  plan: TenantPlanTier;
  ownerId: string;
}
```

**Consumers:** AuditModule (auto-record), ProvisioningService (trigger provisioning workflow)

---

### `tenant.provisioned`
Emitted when provisioning completes (status: ACTIVE).

```typescript
payload: {
  organizationId: string;
  provisionedAt: string;
  defaultProjectId: string;
  resourcesCreated: string[];
}
```

---

### `tenant.suspended`
Emitted when tenant is suspended (billing failure, policy violation, etc).

```typescript
payload: {
  organizationId: string;
  reason: string;
  suspendedBy: string;
  suspendedAt: string;
}
```

---

## Identity Events

### `identity.user.registered`
Emitted when a new user completes registration.

```typescript
payload: {
  userId: string;
  email: string;
  displayName: string;
  registeredAt: string;
}
```

---

### `identity.user.invited`
Emitted when a user is invited to an organization.

```typescript
payload: {
  inviteeEmail: string;
  inviterId: string;
  organizationId: string;
  role: MembershipRole;
  invitationToken: string;  // hashed
  expiresAt: string;
}
```

---

### `identity.apikey.generated`
Emitted when an API key is created. **Audit-critical** — always recorded synchronously.

```typescript
payload: {
  apiKeyId: string;
  prefix: string;           // First 8 chars for display
  userId: string;
  organizationId: string;
  name: string;
  permissions: string[];
  expiresAt?: string;
}
```

---

### `identity.role.assigned`
Emitted when a user's role changes.

```typescript
payload: {
  userId: string;
  organizationId: string;
  role: MembershipRole;
  projectId?: string;
  assignedBy: string;
}
```

---

## Audit Events

### `audit.event.recorded`
Emitted after an audit event is persisted. Consumed by anomaly detection (future).

```typescript
payload: {
  auditEventId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: 'success' | 'failure';
  metadata: Record<string, unknown>;
}
```

---

## Workflow Events

### `workflow.execution.triggered`
Emitted when a workflow execution is created.

```typescript
payload: {
  executionId: string;
  definitionId: string;
  definitionName: string;
  triggeredBy: string;
  triggerType: 'manual' | 'event' | 'schedule';
  input: Record<string, unknown>;
}
```

---

### `workflow.execution.completed`
Emitted when execution reaches a terminal state.

```typescript
payload: {
  executionId: string;
  definitionId: string;
  status: 'completed' | 'failed' | 'cancelled';
  durationMs: number;
  output?: Record<string, unknown>;
  errorMessage?: string;
}
```
