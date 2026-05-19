import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { isNil } from '@atlas/shared-kernel';

/**
 * Extracts the tenant ID from the request object.
 * The TenantContextMiddleware must have populated it.
 *
 * Usage: @TenantId() tenantId: string
 */
export const TenantId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  const tenantId = request.headers?.['x-tenant-id'] ?? request.user?.tenantId;
  if (isNil(tenantId)) {
    throw new Error('TenantId not found in request context');
  }
  return tenantId as string;
});

/**
 * Extracts full user object from JWT payload.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
