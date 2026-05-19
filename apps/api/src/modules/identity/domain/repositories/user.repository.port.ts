import { UserAggregate } from '../aggregates/user.aggregate';

export abstract class UserRepositoryPort {
  abstract findById(id: string): Promise<UserAggregate | null>;
  abstract findByEmail(email: string): Promise<UserAggregate | null>;
  abstract save(user: UserAggregate): Promise<UserAggregate>;
  abstract existsByEmail(email: string): Promise<boolean>;
}
