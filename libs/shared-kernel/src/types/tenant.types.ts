export enum TenantPlanTier {
  FREE = 'free',
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise',
}

export enum TenantStatus {
  PROVISIONING = 'provisioning',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DEPROVISIONING = 'deprovisioning',
  DELETED = 'deleted',
}

export enum MembershipRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  VIEWER = 'viewer',
}

export enum ProjectRole {
  LEAD = 'lead',
  CONTRIBUTOR = 'contributor',
  VIEWER = 'viewer',
}

export interface TenantContextData {
  readonly tenantId: string;
  readonly correlationId: string;
  readonly requestId: string;
  readonly actorId?: string;
  readonly actorType?: 'user' | 'api_key' | 'system';
  readonly timestamp: Date;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}
