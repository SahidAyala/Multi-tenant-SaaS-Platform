import { AggregateRoot, generateId } from '@atlas/shared-kernel';
import { Email } from '../value-objects/email.vo';
import { PasswordHash } from '../value-objects/password-hash.vo';
import { ConflictException } from '@atlas/shared-kernel';

export type UserStatus = 'pending_verification' | 'active' | 'suspended';

export interface UserAggregateProps {
  userId: string;
  email: Email;
  passwordHash: PasswordHash;
  displayName: string;
  status: UserStatus;
  lastLoginAt?: Date;
  emailVerifiedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class UserAggregate extends AggregateRoot<string> {
  private _email: Email;
  private _passwordHash: PasswordHash;
  private _displayName: string;
  private _status: UserStatus;
  private _lastLoginAt?: Date;
  private _emailVerifiedAt?: Date;

  private constructor(props: UserAggregateProps) {
    super({ id: props.userId, createdAt: props.createdAt, updatedAt: props.updatedAt });
    this._email = props.email;
    this._passwordHash = props.passwordHash;
    this._displayName = props.displayName;
    this._status = props.status;
    this._lastLoginAt = props.lastLoginAt;
    this._emailVerifiedAt = props.emailVerifiedAt;
  }

  static async create(params: {
    email: string;
    password: string;
    displayName: string;
  }): Promise<UserAggregate> {
    const userId = generateId();
    const email = Email.create(params.email);
    const passwordHash = await PasswordHash.fromPlaintext(params.password);

    return new UserAggregate({
      userId,
      email,
      passwordHash,
      displayName: params.displayName,
      status: 'pending_verification',
    });
  }

  static reconstitute(props: UserAggregateProps): UserAggregate {
    return new UserAggregate(props);
  }

  async verifyPassword(plaintext: string): Promise<boolean> {
    return this._passwordHash.verify(plaintext);
  }

  activate(): void {
    if (this._status !== 'pending_verification') {
      throw new ConflictException(`Cannot activate user in status: ${this._status}`);
    }
    this._status = 'active';
    this._emailVerifiedAt = new Date();
    this.touch();
  }

  recordLogin(): void {
    this._lastLoginAt = new Date();
    this.touch();
  }

  suspend(): void {
    if (this._status === 'suspended') return;
    this._status = 'suspended';
    this.touch();
  }

  get userId(): string { return this._id; }
  get email(): Email { return this._email; }
  get displayName(): string { return this._displayName; }
  get status(): UserStatus { return this._status; }
  get lastLoginAt(): Date | undefined { return this._lastLoginAt; }
  get emailVerifiedAt(): Date | undefined { return this._emailVerifiedAt; }
  get isActive(): boolean { return this._status === 'active'; }
  get passwordHash(): PasswordHash { return this._passwordHash; }
}
