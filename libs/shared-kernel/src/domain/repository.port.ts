import { AggregateRoot } from './aggregate-root.base';
import { PaginatedResult, PaginationOptions } from '../types/pagination.types';

export interface RepositoryPort<T extends AggregateRoot> {
  findById(id: string, tenantId: string): Promise<T | null>;
  findAll(tenantId: string, options?: PaginationOptions): Promise<PaginatedResult<T>>;
  save(entity: T): Promise<T>;
  delete(id: string, tenantId: string): Promise<void>;
  exists(id: string, tenantId: string): Promise<boolean>;
}
