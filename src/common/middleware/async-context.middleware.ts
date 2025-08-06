import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

import { AsyncStorageProvider } from '../providers/async-storage.provider';

@Injectable()
export class AsyncContextMiddleware implements NestMiddleware {
  constructor(private readonly asyncStorage: AsyncStorageProvider) {}

  use(req: Request, res: Response, next: NextFunction) {
    const context = {
      requestId: req['requestId'],
      startTime: Date.now(),
      correlationId: req.headers['x-correlation-id'] as string,
    };

    this.asyncStorage.run(context, () => {
      next();
    });
  }
}
