export interface ITenantContextPort {
  /** Returns the current tenant ID. Throws if no context is active. */
  readonly tenantId: string;

  /** Returns the tenant ID without throwing — undefined when outside a request. */
  tryGetTenantId(): string | undefined;

  isInitialized(): boolean;
}
