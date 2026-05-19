import { Injectable, Scope } from '@nestjs/common';
import { isNil, isUndefined } from '@atlas/shared-kernel';
import { AsyncLocalStorage } from 'async_hooks';
import { ITenantContextPort } from '@atlas/shared-kernel';
import { TenantContext } from './tenant-context.interface';

/**
 * Propagates tenant context through the request lifecycle using AsyncLocalStorage.
 * This avoids "tenant id as function parameter" pollution across the entire call stack.
 *
 * Scope.DEFAULT is intentional — the store lives in AsyncLocalStorage, not in DI scope.
 */
@Injectable({ scope: Scope.DEFAULT })
export class TenantContextService implements ITenantContextPort {
  private readonly storage = new AsyncLocalStorage<TenantContext>();

  run<T>(context: TenantContext, fn: () => T): T {
    return this.storage.run(context, fn) as T;
  }

  getContext(): TenantContext {
    const ctx = this.storage.getStore();
    if (isNil(ctx)) {
      throw new Error(
        'TenantContext not initialized. Ensure TenantContextMiddleware is applied before accessing tenant context.',
      );
    }
    return ctx;
  }

  tryGetContext(): TenantContext | undefined {
    return this.storage.getStore();
  }

  get tenantId(): string {
    return this.getContext().tenantId;
  }

  get correlationId(): string {
    return this.getContext().correlationId;
  }

  get actorId(): string | undefined {
    return this.getContext().actorId;
  }

  tryGetTenantId(): string | undefined {
    return this.storage.getStore()?.tenantId;
  }

  isInitialized(): boolean {
    return !isUndefined(this.storage.getStore());
  }
}
