// Base
export { TenantAwareEvent, EventEnvelope } from './base/tenant-aware-event.interface';

// Tenant events
export { TENANT_CREATED, TenantCreatedEvent, TenantCreatedPayload } from './tenant/tenant-created.event';
export { TENANT_PROVISIONED, TenantProvisionedEvent, TenantProvisionedPayload } from './tenant/tenant-provisioned.event';
export { TENANT_SUSPENDED, TenantSuspendedEvent, TenantSuspendedPayload } from './tenant/tenant-suspended.event';
export { SUBSCRIPTION_CHANGED, SubscriptionChangedEvent, SubscriptionChangedPayload } from './tenant/subscription-changed.event';

// Identity events
export { USER_REGISTERED, UserRegisteredEvent, UserRegisteredPayload } from './identity/user-registered.event';
export { USER_INVITED, UserInvitedEvent, UserInvitedPayload } from './identity/user-invited.event';
export { USER_JOINED_TENANT, UserJoinedTenantEvent, UserJoinedTenantPayload } from './identity/user-joined-tenant.event';
export { API_KEY_GENERATED, ApiKeyGeneratedEvent, ApiKeyGeneratedPayload } from './identity/api-key-generated.event';
export { ROLE_ASSIGNED, RoleAssignedEvent, RoleAssignedPayload } from './identity/role-assigned.event';
export {
  AUTHENTICATION_SUCCEEDED,
  AUTHENTICATION_FAILED,
  AuthenticationSucceededEvent,
  AuthenticationSucceededPayload,
  AuthenticationFailedEvent,
  AuthenticationFailedPayload,
} from './identity/authentication.event';
export { RBAC_VIOLATION_DETECTED, RBACViolationDetectedEvent, RBACViolationDetectedPayload } from './identity/rbac-violation.event';

// Audit events
export { AUDIT_EVENT_RECORDED, AuditEventRecordedEvent, AuditEventRecordedPayload } from './audit/audit-event-recorded.event';

// Workflow events
export { WORKFLOW_TRIGGERED, WorkflowTriggeredEvent, WorkflowTriggeredPayload } from './workflow/workflow-triggered.event';
export { WORKFLOW_COMPLETED, WorkflowCompletedEvent, WorkflowCompletedPayload } from './workflow/workflow-completed.event';
export { WORKFLOW_FAILED, WorkflowFailedEvent, WorkflowFailedPayload } from './workflow/workflow-failed.event';
