import { UserAggregate } from '../aggregates/user.aggregate';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface UserRepositoryPort {
  findById(id: string): Promise<UserAggregate | null>;
  findByEmail(email: string): Promise<UserAggregate | null>;
  save(user: UserAggregate): Promise<UserAggregate>;
  existsByEmail(email: string): Promise<boolean>;
}
