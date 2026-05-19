import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { isNil, isEmpty } from '@atlas/shared-kernel';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { MembershipRole } from '@atlas/shared-kernel';

interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: MembershipRole;
}

/**
 * Enforces RBAC on routes decorated with @Roles(...).
 * Role hierarchy: OWNER > ADMIN > MEMBER > VIEWER
 *
 * Runs AFTER JwtAuthGuard populates req.user.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  private static readonly ROLE_HIERARCHY: Record<MembershipRole, number> = {
    [MembershipRole.OWNER]: 4,
    [MembershipRole.ADMIN]: 3,
    [MembershipRole.MEMBER]: 2,
    [MembershipRole.VIEWER]: 1,
  };

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<MembershipRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isEmpty(requiredRoles)) return true;

    const request = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    const user = request.user;

    if (isNil(user)) {
      throw new ForbiddenException('No authenticated user');
    }

    const userRank = RbacGuard.ROLE_HIERARCHY[user.role] ?? 0;
    const meetsAnyRole = requiredRoles.some(
      (role) => userRank >= RbacGuard.ROLE_HIERARCHY[role],
    );

    if (!meetsAnyRole) {
      throw new ForbiddenException(
        `Role '${user.role}' does not meet required roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
