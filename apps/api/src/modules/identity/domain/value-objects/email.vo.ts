import { ValueObject } from '@atlas/shared-kernel';
import { ValidationException } from '@atlas/shared-kernel';

interface EmailProps {
  value: string;
}

export class Email extends ValueObject<EmailProps> {
  private static readonly PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private constructor(props: EmailProps) {
    super(props);
  }

  static create(value: string): Email {
    const normalized = value.toLowerCase().trim();
    if (!Email.PATTERN.test(normalized)) {
      throw new ValidationException({ email: ['Invalid email address format'] });
    }
    if (normalized.length > 320) {
      throw new ValidationException({ email: ['Email address exceeds maximum length of 320 characters'] });
    }
    return new Email({ value: normalized });
  }

  get value(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
