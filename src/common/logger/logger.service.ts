import {
  Injectable,
  Inject,
  LoggerService as NestLoggerService,
} from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

import { safeStringify } from '../utils/safe-json.util';
import { AsyncStorageProvider } from '../providers/async-storage.provider';

@Injectable()
export class LoggerService implements NestLoggerService {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    private readonly asyncStorage: AsyncStorageProvider,
  ) {}

  private getContext(): Record<string, any> {
    const store = this.asyncStorage.getStore();
    return {
      requestId: store?.requestId,
      userId: store?.userId,
      correlationId: store?.correlationId,
    };
  }

  private formatMessage(message: any, context?: string): string {
    const contextStr = context ? `[${context}] ` : '';
    return `${contextStr}${typeof message === 'string' ? message : safeStringify(message)}`;
  }

  log(message: any, context?: string) {
    this.logger.info(this.formatMessage(message, context), {
      ...this.getContext(),
      context,
    });
  }

  error(message: any, trace?: string, context?: string) {
    this.logger.error(this.formatMessage(message, context), {
      ...this.getContext(),
      context,
      trace,
    });
  }

  warn(message: any, context?: string) {
    this.logger.warn(this.formatMessage(message, context), {
      ...this.getContext(),
      context,
    });
  }

  debug(message: any, context?: string) {
    this.logger.debug(this.formatMessage(message, context), {
      ...this.getContext(),
      context,
    });
  }

  verbose(message: any, context?: string) {
    this.logger.verbose(this.formatMessage(message, context), {
      ...this.getContext(),
      context,
    });
  }

  // Custom methods for structured logging
  logRequest(req: any, res: any, responseTime: number) {
    this.logger.info('HTTP Request', {
      ...this.getContext(),
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
    });
  }

  logError(
    error: Error,
    context?: string,
    additionalData?: Record<string, any>,
  ) {
    this.logger.error('Application Error', {
      ...this.getContext(),
      context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      ...additionalData,
    });
  }

  logTrace(event: string, data?: Record<string, any>, context?: string) {
    this.logger.info('Trace Event', {
      ...this.getContext(),
      event,
      context,
      ...data,
    });
  }
}
