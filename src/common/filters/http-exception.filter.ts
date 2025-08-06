import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { LoggerService } from '../logger/logger.service';
import { AsyncStorageProvider } from '../providers/async-storage.provider';
import { sanitizeForLogging } from '../utils/safe-json.util';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly asyncStorage: AsyncStorageProvider,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        message = (exceptionResponse as any).message || message;
        error = (exceptionResponse as any).error || error;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
      error,
      requestId: this.asyncStorage.getRequestId(),
    };

    // Log the error with context
    this.loggerService.logError(
      exception instanceof Error ? exception : new Error(String(exception)),
      HttpExceptionFilter.name,
      {
        statusCode: status,
        path: request.url,
        method: request.method,
        query: sanitizeForLogging(request.query),
        body: sanitizeForLogging(request.body),
        headers: sanitizeForLogging(request.headers),
        ip: request.ip,
        userAgent: request.get('User-Agent'),
      },
    );

    response.status(status).json(errorResponse);
  }
}
