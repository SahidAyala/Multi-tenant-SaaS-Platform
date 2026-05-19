import { ValueObject } from '@atlas/shared-kernel';
import { ValidationException } from '@atlas/shared-kernel';

interface TenantSlugProps {
  value: string;
}

export class TenantSlug extends ValueObject<TenantSlugProps> {
  private static readonly PATTERN = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

  private constructor(props: TenantSlugProps) {
    super(props);
  }

  static create(value: string): TenantSlug {
    const normalized = value.toLowerCase().trim();
    if (!TenantSlug.PATTERN.test(normalized)) {
      throw new ValidationException({
        slug: ['Slug must be 3-63 lowercase alphanumeric characters or hyphens, not starting or ending with a hyphen'],
      });
    }
    return new TenantSlug({ value: normalized });
  }

  get value(): string {
    return this.props.value;
  }

  toString(): string {
    return this.props.value;
  }
}
