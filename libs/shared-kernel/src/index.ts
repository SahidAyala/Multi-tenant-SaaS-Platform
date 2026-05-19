// Domain base classes
export { AggregateRoot } from './domain/aggregate-root.base';
export { Entity } from './domain/entity.base';
export { ValueObject } from './domain/value-object.base';
export { DomainEvent, DomainEventMetadata } from './domain/domain-event.base';
export { RepositoryPort } from './domain/repository.port';
export { UseCase } from './domain/use-case.port';
export { Command } from './domain/command.base';
export { Query } from './domain/query.base';

// Types
export {
  TenantId,
  UserId,
  ProjectId,
  MembershipId,
  ApiKeyId,
  AuditEventId,
  WorkflowDefinitionId,
  WorkflowExecutionId,
  CorrelationId,
  RoleId,
} from './types/id.types';
export {
  TenantPlanTier,
  TenantStatus,
  MembershipRole,
  ProjectRole,
  TenantContextData,
} from './types/tenant.types';
export {
  PaginationOptions,
  PaginationMeta,
  PaginatedResult,
  buildPaginationMeta,
} from './types/pagination.types';
export { Result } from './types/result.types';

// Exceptions
export { DomainException } from './exceptions/domain.exception';
export { NotFoundException } from './exceptions/not-found.exception';
export { ConflictException } from './exceptions/conflict.exception';
export { UnauthorizedException } from './exceptions/unauthorized.exception';
export { ForbiddenException } from './exceptions/forbidden.exception';
export { ValidationException } from './exceptions/validation.exception';

// Utils
export { generateId, isValidUuid } from './utils/id.util';
