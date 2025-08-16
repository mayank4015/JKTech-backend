import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';

import { LoggerService } from '../logger/logger.service';
import { AsyncStorageProvider } from '../providers/async-storage.provider';

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly asyncStorage: AsyncStorageProvider,
  ) {}

  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const errorResponse = {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message: 'Too many requests',
      error: 'Too Many Requests',
      requestId: this.asyncStorage.getRequestId(),
    };

    // Log rate limit violation
    this.loggerService.logTrace('Rate limit exceeded', {
      ip: request.ip,
      path: request.url,
      method: request.method,
      userAgent: request.get('User-Agent'),
    });

    response.status(HttpStatus.TOO_MANY_REQUESTS).json(errorResponse);
  }
}
