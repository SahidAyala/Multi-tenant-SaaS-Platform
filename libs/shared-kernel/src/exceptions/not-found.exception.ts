import { DomainException } from './domain.exception';

export class NotFoundException extends DomainException {
  readonly code = 'NOT_FOUND';

  constructor(entity: string, id: string) {
    super(`${entity} with id '${id}' was not found`);
  }
}
