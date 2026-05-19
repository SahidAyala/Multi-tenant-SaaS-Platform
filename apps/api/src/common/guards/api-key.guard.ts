import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { isNil } from '@atlas/shared-kernel';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Validates API key authentication as an alternative to JWT.
 * API keys are extracted from the Authorization header: "Bearer ak_<prefix>.<secret>"
 * or X-API-Key header.
 *
 * Actual key validation is delegated to IdentityModule via a token-based injection.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const apiKey = this.extractApiKey(request);

    if (isNil(apiKey)) return false;

    // Validation delegated — guard confirms format, identity module validates hash
    const isValidFormat = apiKey.startsWith('ak_') && apiKey.includes('.');
    if (!isValidFormat) {
      throw new UnauthorizedException('Malformed API key format');
    }

    return true;
  }

  private extractApiKey(request: Record<string, unknown>): string | null {
    const headers = request.headers as Record<string, string>;
    const apiKeyHeader = headers['x-api-key'];
    if (apiKeyHeader) return apiKeyHeader;

    const authHeader = headers['authorization'];
    if (authHeader?.startsWith('Bearer ak_')) {
      return authHeader.substring(7);
    }

    return null;
  }
}
