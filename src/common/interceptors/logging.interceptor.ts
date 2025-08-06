import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

import { LoggerService } from '../logger/logger.service';
import { AsyncStorageProvider } from '../providers/async-storage.provider';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly asyncStorage: AsyncStorageProvider,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const startTime = this.asyncStorage.getStartTime() || Date.now();

    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - startTime;

        this.loggerService.logRequest(request, response, responseTime);

        // Log trace event for successful requests
        this.loggerService.logTrace('Request completed', {
          method: request.method,
          url: request.url,
          statusCode: response.statusCode,
          responseTime,
        });
      }),
    );
  }
}
