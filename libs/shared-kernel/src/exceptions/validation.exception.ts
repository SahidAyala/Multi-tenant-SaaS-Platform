import { DomainException } from './domain.exception';

export class ValidationException extends DomainException {
  readonly code = 'VALIDATION_ERROR';
  readonly violations: Record<string, string[]>;

  constructor(violations: Record<string, string[]>) {
    super('Validation failed');
    this.violations = violations;
  }
}
