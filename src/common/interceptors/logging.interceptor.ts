import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { Request, Response } from 'express';

import { HttpLoggerService } from '../logger/http-logger.service';
import { AsyncStorageProvider } from '../providers/async-storage.provider';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  constructor(
    private readonly httpLogger: HttpLoggerService,
    private readonly asyncStorage: AsyncStorageProvider,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const startTime = this.asyncStorage.getStartTime() || Date.now();

    return next.handle().pipe(
      tap((responseBody) => {
        const responseTime = Date.now() - startTime;

        // Log HTTP request summary (one-liner)
        this.httpLogger.logHttpRequest(request, response, responseTime);

        // Log detailed trace data
        this.httpLogger.logHttpTrace(
          request,
          response,
          responseTime,
          responseBody,
        );
      }),
      catchError((error) => {
        const responseTime = Date.now() - startTime;

        // Log HTTP error
        this.httpLogger.logHttpError(error, request, response, {
          responseTime,
        });

        return throwError(() => error);
      }),
    );
  }
}
