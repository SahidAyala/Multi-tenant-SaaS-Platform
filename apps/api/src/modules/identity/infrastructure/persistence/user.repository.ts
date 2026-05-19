import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAggregate } from '../../domain/aggregates/user.aggregate';
import { UserRepositoryPort } from '../../domain/repositories/user.repository.port';

import { UserOrmEntity } from './user.orm-entity';
import { Email } from '../../domain/value-objects/email.vo';
import { PasswordHash } from '../../domain/value-objects/password-hash.vo';

/**
 * Intentionally does NOT extend TenantScopedRepository.
 *
 * Users are a global (cross-tenant) entity. A user authenticates with email +
 * password without knowing their tenantId upfront — the JWT they receive then
 * carries the tenantId for subsequent requests. Tenant membership is enforced
 * at the application layer (roles, RBAC guards), not here.
 *
 * If you need to add a method that reads across multiple tenants for a given
 * user, that is correct here. If you're tempted to scope findById() by tenant,
 * you likely want the membership layer instead.
 */
@Injectable()
export class UserRepository implements UserRepositoryPort {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly repo: Repository<UserOrmEntity>,
  ) {}

  async findById(id: string): Promise<UserAggregate | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? this.toDomain(orm) : null;
  }

  async findByEmail(email: string): Promise<UserAggregate | null> {
    const orm = await this.repo.findOne({ where: { email: email.toLowerCase() } });
    return orm ? this.toDomain(orm) : null;
  }

  async save(user: UserAggregate): Promise<UserAggregate> {
    const orm = this.toOrm(user);
    const saved = await this.repo.save(orm);
    return this.toDomain(saved);
  }

  async existsByEmail(email: string): Promise<boolean> {
    return this.repo.existsBy({ email: email.toLowerCase() });
  }

  private toDomain(orm: UserOrmEntity): UserAggregate {
    return UserAggregate.reconstitute({
      userId: orm.id,
      email: Email.create(orm.email),
      passwordHash: PasswordHash.fromHash(orm.passwordHash),
      displayName: orm.displayName,
      status: orm.status,
      lastLoginAt: orm.lastLoginAt,
      emailVerifiedAt: orm.emailVerifiedAt,
      createdAt: orm.createdAt,
      updatedAt: orm.updatedAt,
    });
  }

  private toOrm(user: UserAggregate): UserOrmEntity {
    const orm = new UserOrmEntity();
    orm.id = user.userId;
    orm.email = user.email.value;
    orm.passwordHash = user.passwordHash.hash;
    orm.displayName = user.displayName;
    orm.status = user.status;
    orm.lastLoginAt = user.lastLoginAt;
    orm.emailVerifiedAt = user.emailVerifiedAt;
    return orm;
  }
}
