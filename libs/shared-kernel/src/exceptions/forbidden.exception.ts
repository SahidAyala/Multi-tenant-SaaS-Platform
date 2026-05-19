import { DomainException } from './domain.exception';

export class ForbiddenException extends DomainException {
  readonly code = 'FORBIDDEN';

  constructor(message = 'Insufficient permissions') {
    super(message);
  }
}
