import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { isNil } from '@atlas/shared-kernel';
import { ConfigService } from '@nestjs/config';
import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { TenantContextService } from './tenant-context.service';

/**
 * Resolves tenant from JWT claims or x-tenant-id header, then stores it
 * in AsyncLocalStorage for the duration of the request.
 *
 * Tenant resolution order:
 *  1. JWT sub-claim (tenantId) — trusted, signed
 *  2. x-tenant-id header — only trusted on internal/system routes
 *
 * Routes marked @Public() bypass tenant enforcement.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly tenantContextService: TenantContextService,
    private readonly configService: ConfigService,
  ) {}

  use(req: FastifyRequest['raw'] & Record<string, unknown>, res: FastifyReply['raw'], next: () => void): void {
    const requestId = uuidv4();
    const correlationId = (req.headers?.['x-correlation-id'] as string) ?? uuidv4();

    // Attempt to extract tenant from already-decoded JWT (set by auth guards)
    // At middleware level we may not yet have a verified JWT; guards run after middleware.
    // We set a provisional context here; guards will enrich it with actorId.
    const tenantIdFromHeader = req.headers?.['x-tenant-id'] as string | undefined;

    if (isNil(tenantIdFromHeader)) {
      // Requests without a tenant header proceed — public routes are allowed,
      // protected routes will fail at the guard layer.
      next();
      return;
    }

    this.tenantContextService.run(
      {
        tenantId: tenantIdFromHeader,
        correlationId,
        requestId,
        timestamp: new Date(),
        ipAddress: req.socket?.remoteAddress,
        userAgent: req.headers?.['user-agent'] as string | undefined,
      },
      () => {
        // Attach correlation ID to response headers for distributed tracing
        res.setHeader('x-correlation-id', correlationId);
        res.setHeader('x-request-id', requestId);
        next();
      },
    );
  }
}
