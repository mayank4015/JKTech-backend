import { AsyncLocalStorage } from 'async_hooks';

import { Injectable } from '@nestjs/common';

export interface AsyncContext {
  requestId?: string;
  userId?: string;
  correlationId?: string;
  startTime?: number;
  [key: string]: any;
}

@Injectable()
export class AsyncStorageProvider {
  private readonly asyncLocalStorage = new AsyncLocalStorage<AsyncContext>();

  run<T>(context: AsyncContext, callback: () => T): T {
    return this.asyncLocalStorage.run(context, callback);
  }

  getStore(): AsyncContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  set(key: string, value: any): void {
    const store = this.getStore();
    if (store) {
      store[key] = value;
    }
  }

  get(key: string): any {
    const store = this.getStore();
    return store?.[key];
  }

  getRequestId(): string | undefined {
    return this.get('requestId');
  }

  getUserId(): string | undefined {
    return this.get('userId');
  }

  getCorrelationId(): string | undefined {
    return this.get('correlationId');
  }

  getStartTime(): number | undefined {
    return this.get('startTime');
  }
}
