export interface TenantContext {
  readonly tenantId: string;
  readonly correlationId: string;
  readonly requestId: string;
  readonly actorId?: string;
  readonly actorType?: 'user' | 'api_key' | 'system';
  readonly timestamp: Date;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}
