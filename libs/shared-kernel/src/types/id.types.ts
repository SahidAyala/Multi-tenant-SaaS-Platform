// Branded types prevent ID cross-contamination between aggregates

declare const __brand: unique symbol;

type Brand<T, B> = T & { [__brand]: B };

export type TenantId = Brand<string, 'TenantId'>;
export type UserId = Brand<string, 'UserId'>;
export type ProjectId = Brand<string, 'ProjectId'>;
export type MembershipId = Brand<string, 'MembershipId'>;
export type ApiKeyId = Brand<string, 'ApiKeyId'>;
export type AuditEventId = Brand<string, 'AuditEventId'>;
export type WorkflowDefinitionId = Brand<string, 'WorkflowDefinitionId'>;
export type WorkflowExecutionId = Brand<string, 'WorkflowExecutionId'>;
export type CorrelationId = Brand<string, 'CorrelationId'>;
export type RoleId = Brand<string, 'RoleId'>;

export const TenantId = (s: string): TenantId => s as TenantId;
export const UserId = (s: string): UserId => s as UserId;
export const ProjectId = (s: string): ProjectId => s as ProjectId;
export const MembershipId = (s: string): MembershipId => s as MembershipId;
export const ApiKeyId = (s: string): ApiKeyId => s as ApiKeyId;
export const AuditEventId = (s: string): AuditEventId => s as AuditEventId;
export const WorkflowDefinitionId = (s: string): WorkflowDefinitionId =>
  s as WorkflowDefinitionId;
export const WorkflowExecutionId = (s: string): WorkflowExecutionId =>
  s as WorkflowExecutionId;
export const CorrelationId = (s: string): CorrelationId => s as CorrelationId;
export const RoleId = (s: string): RoleId => s as RoleId;
