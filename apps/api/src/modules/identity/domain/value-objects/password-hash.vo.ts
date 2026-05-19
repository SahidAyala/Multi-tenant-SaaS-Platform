import { ValueObject } from '@atlas/shared-kernel';
import * as bcrypt from 'bcrypt';
import { ValidationException } from '@atlas/shared-kernel';

interface PasswordHashProps {
  hash: string;
}

export class PasswordHash extends ValueObject<PasswordHashProps> {
  private static readonly ROUNDS = 12;
  private static readonly MIN_LENGTH = 8;

  private constructor(props: PasswordHashProps) {
    super(props);
  }

  static async fromPlaintext(plaintext: string): Promise<PasswordHash> {
    if (plaintext.length < PasswordHash.MIN_LENGTH) {
      throw new ValidationException({
        password: [`Password must be at least ${PasswordHash.MIN_LENGTH} characters`],
      });
    }
    const hash = await bcrypt.hash(plaintext, PasswordHash.ROUNDS);
    return new PasswordHash({ hash });
  }

  static fromHash(hash: string): PasswordHash {
    return new PasswordHash({ hash });
  }

  async verify(plaintext: string): Promise<boolean> {
    return bcrypt.compare(plaintext, this.props.hash);
  }

  get hash(): string {
    return this.props.hash;
  }
}
