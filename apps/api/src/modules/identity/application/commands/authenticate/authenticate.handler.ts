import { Injectable, Logger } from '@nestjs/common';
import {
  isNil,
  MembershipRole,
  Result,
  SystemQueryContext,
  TenantStatus,
  UnauthorizedException,
} from '@atlas/shared-kernel';
import { JwtService } from '@nestjs/jwt';
import { AuthenticateCommand } from './authenticate.command';
import { UserRepositoryPort } from '../../../domain/repositories/user.repository.port';
import { OrganizationRepositoryPort } from '../../../../tenant-core/domain/repositories/organization.repository.port';
import { OrganizationAggregate } from '../../../../tenant-core/domain/aggregates/organization.aggregate';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
  email: string;
  tenantId: string;
}

/**
 * Authenticates a user and resolves the tenant context the resulting JWT will
 * carry. Until a persisted memberships table exists, the user's relationship
 * to a tenant is expressed through `organizations.owner_id` — so this handler
 * resolves the tenant by ownership.
 *
 * Tenant isolation:
 *   The login endpoint runs *outside* any tenant context (no JWT exists yet),
 *   so the organization lookup is performed with a SystemQueryContext. The
 *   handler then mints a JWT whose `tenantId` claim binds the session to a
 *   single tenant, which the tenant-context middleware uses downstream.
 *
 *   Returning a token without a real tenantId (e.g., 'global') would let an
 *   authenticated request bypass tenant-scoped repository guards. That is
 *   why a user who owns no organization is denied at this layer rather than
 *   being issued a placeholder token.
 *
 * When the memberships table lands, the resolution branch below moves into a
 * MembershipRepository lookup and `role` derives from the membership row
 * rather than ownership. The contract of this handler does not change.
 */
@Injectable()
export class AuthenticateHandler {
  private readonly logger = new Logger(AuthenticateHandler.name);

  constructor(
    private readonly userRepository: UserRepositoryPort,
    private readonly organizationRepository: OrganizationRepositoryPort,
    private readonly jwtService: JwtService,
  ) {}

  async execute(command: AuthenticateCommand): Promise<Result<TokenPair>> {
    const user = await this.userRepository.findByEmail(command.email);
    if (isNil(user)) {
      // Constant-time response to prevent email enumeration
      return Result.fail(new UnauthorizedException('Invalid credentials'));
    }

    const passwordValid = await user.verifyPassword(command.password);
    if (!passwordValid) {
      return Result.fail(new UnauthorizedException('Invalid credentials'));
    }

    if (!user.isActive) {
      return Result.fail(new UnauthorizedException(`Account is ${user.status}`));
    }

    // Resolve the tenant the JWT will scope to. The user must be linked to an
    // active organization; otherwise there is no tenant to issue a token for.
    const ctx = SystemQueryContext.forSuperAdmin(user.userId, 'authenticate-login');
    const organization = await this.resolveOrganization(
      user.userId,
      command.organizationSlug,
      ctx,
    );

    if (isNil(organization)) {
      // Generic message — do not disclose whether the failure was credentials,
      // missing membership, or wrong tenant slug.
      return Result.fail(new UnauthorizedException('Invalid credentials'));
    }

    if (organization.ownerId !== user.userId) {
      // The slug was valid but this user is not its owner. With no memberships
      // table yet, ownership is the only path into a tenant.
      return Result.fail(new UnauthorizedException('Invalid credentials'));
    }

    if (organization.status !== TenantStatus.ACTIVE) {
      return Result.fail(
        new UnauthorizedException(`Tenant is ${organization.status}`),
      );
    }

    user.recordLogin();
    await this.userRepository.save(user);

    // Ownership maps to OWNER role until memberships exist (see ADR / bootstrap script).
    const role = MembershipRole.OWNER;
    const tenantId = organization.organizationId;

    const accessToken = this.jwtService.sign(
      {
        sub: user.userId,
        email: user.email.value,
        tenantId,
        role,
        type: 'access',
      },
      { expiresIn: '15m' },
    );

    const refreshToken = this.jwtService.sign(
      { sub: user.userId, tenantId, type: 'refresh' },
      { expiresIn: '7d' },
    );

    this.logger.log(
      `User authenticated: userId=${user.userId} tenantId=${tenantId} role=${role}`,
    );

    return Result.ok({
      accessToken,
      refreshToken,
      expiresIn: 900,
      userId: user.userId,
      email: user.email.value,
      tenantId,
    });
  }

  /**
   * Resolves which organization to scope the session to.
   *
   * - If the caller supplied an `organizationSlug`, look it up by slug. The
   *   caller-side ownership check (above) then enforces that this user may
   *   enter it.
   * - Otherwise, find an organization the user owns. This is the convenience
   *   path for users with a single tenant.
   *
   * Both paths use SystemQueryContext because no tenant context exists yet —
   * the JWT we are about to mint is what establishes it.
   */
  private async resolveOrganization(
    userId: string,
    organizationSlug: string | undefined,
    ctx: SystemQueryContext,
  ): Promise<OrganizationAggregate | null> {
    if (!isNil(organizationSlug) && organizationSlug.length > 0) {
      return this.organizationRepository.findBySlug(organizationSlug, ctx);
    }
    return this.organizationRepository.findByOwnerId(userId, ctx);
  }
}
