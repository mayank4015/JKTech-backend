import { Injectable } from '@nestjs/common';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { Request, Response } from 'express';
import * as path from 'path';

import { AppConfigService } from '../../config/app-config.service';
import { AsyncStorageProvider } from '../providers/async-storage.provider';
import { safeStringify, sanitizeForLogging } from '../utils/safe-json.util';

@Injectable()
export class HttpLoggerService {
  private readonly applicationLogger: winston.Logger;
  private readonly traceLoggers: Map<string, winston.Logger> = new Map();

  constructor(
    private readonly configService: AppConfigService,
    private readonly asyncStorage: AsyncStorageProvider,
  ) {
    this.applicationLogger = this.createApplicationLogger();
  }

  /**
   * Create dedicated logger for HTTP request summaries (one-liners)
   */
  private createApplicationLogger(): winston.Logger {
    const isProduction = this.configService.isProduction();

    const transports: winston.transport[] = [];

    // Console transport for development
    if (!isProduction) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message }) => {
              return `${timestamp} ${level}: ${message}`;
            }),
          ),
        }),
      );
    }

    // File transport for application logs (HTTP request summaries) - Single persistent file
    const logsDir = this.configService.getLogsDir();
    transports.push(
      new winston.transports.File({
        filename: path.join(logsDir, 'application.log'),
        maxsize: 50 * 1024 * 1024, // 50MB max file size
        maxFiles: 5, // Keep 5 backup files
        tailable: true, // Keep writing to the same file
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message }) => {
            // One-line format for quick overview - exclude metadata
            return `${timestamp} ${level.toUpperCase()}: ${message}`;
          }),
        ),
      }),
    );

    return winston.createLogger({
      level: 'info',
      transports,
    });
  }

  /**
   * Create dedicated logger for detailed trace logs per request
   */
  private createTraceLogger(requestId: string): winston.Logger {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19); // YYYY-MM-DDTHH-MM-SS

    const logsDir = this.configService.getLogsDir();
    const traceDir = path.join(logsDir, 'trace');
    const filename = path.join(
      traceDir,
      `JKTECH-${today}-${requestId}-${timestamp}.log`,
    );

    const transports: winston.transport[] = [];

    // File transport for trace logs (detailed request/response data) - One file per request
    transports.push(
      new winston.transports.File({
        filename,
        maxsize: 10 * 1024 * 1024, // 10MB max file size per request
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    );

    return winston.createLogger({
      level: 'debug',
      transports,
    });
  }

  /**
   * Get or create trace logger for a specific request
   */
  private getTraceLogger(requestId: string): winston.Logger {
    if (!this.traceLoggers.has(requestId)) {
      const logger = this.createTraceLogger(requestId);
      this.traceLoggers.set(requestId, logger);

      // Clean up logger after 1 hour to prevent memory leaks
      setTimeout(
        () => {
          const logger = this.traceLoggers.get(requestId);
          if (logger) {
            logger.close();
            this.traceLoggers.delete(requestId);
          }
        },
        60 * 60 * 1000,
      ); // 1 hour
    }

    return this.traceLoggers.get(requestId)!;
  }

  /**
   * Generate trace filename for a request
   */
  private generateTraceFilename(requestId: string): string {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19); // YYYY-MM-DDTHH-MM-SS
    return `JKTECH-${today}-${requestId}-${timestamp}.log`;
  }

  /**
   * Generate HTTPS trace URL for a request
   */
  private generateTraceUrl(requestId: string): string {
    const traceDomain = this.configService.getTraceDomain();

    if (!traceDomain) {
      // Fallback to local file reference if no trace domain is configured
      return this.generateTraceFilename(requestId);
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19); // YYYY-MM-DDTHH-MM-SS

    // Generate filename without extension and add .trace extension
    const baseFilename = `JKTECH-${today}-${requestId}-${timestamp}`;

    // Remove trailing slash from domain if present
    const cleanDomain = traceDomain.replace(/\/$/, '');

    return `${cleanDomain}/${baseFilename}.trace`;
  }

  /**
   * Log HTTP request summary (one-liner for application.log)
   */
  logHttpRequest(req: Request, res: Response, responseTime: number): void {
    const store = this.asyncStorage.getStore();
    const requestId = store?.requestId || 'unknown';
    const traceFilename = this.generateTraceFilename(requestId);
    const traceUrl = this.generateTraceUrl(requestId);

    // One-line summary format with unique trace URL
    const summary = `${req.method} ${req.url} ${res.statusCode} ${responseTime}ms [${requestId}] trace:${traceUrl}`;

    this.applicationLogger.info(summary, {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime,
      traceFile: traceFilename,
      traceUrl,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      userId: store?.userId,
    });
  }

  /**
   * Log detailed trace data (full request/response for trace logs)
   */
  logTrace(event: string, data: Record<string, any>): void {
    const store = this.asyncStorage.getStore();
    const requestId = store?.requestId || 'unknown';
    const traceLogger = this.getTraceLogger(requestId);

    traceLogger.info('Trace Event', {
      event,
      requestId,
      userId: store?.userId,
      correlationId: store?.correlationId,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  /**
   * Log detailed HTTP request/response data
   */
  logHttpTrace(
    req: Request,
    res: Response,
    responseTime: number,
    responseBody?: any,
  ): void {
    const store = this.asyncStorage.getStore();
    const requestId = store?.requestId || 'unknown';
    const traceLogger = this.getTraceLogger(requestId);

    traceLogger.info('HTTP Request Complete', {
      requestId,
      userId: store?.userId,
      correlationId: store?.correlationId,
      request: {
        method: req.method,
        url: req.url,
        headers: sanitizeForLogging(req.headers),
        query: sanitizeForLogging(req.query),
        body: sanitizeForLogging(req.body),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      },
      response: {
        statusCode: res.statusCode,
        headers: sanitizeForLogging(res.getHeaders()),
        body: responseBody ? sanitizeForLogging(responseBody) : undefined,
      },
      performance: {
        responseTime,
        startTime: store?.startTime,
        endTime: Date.now(),
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Log HTTP errors with full context
   */
  logHttpError(
    error: Error,
    req: Request,
    res: Response,
    additionalData?: Record<string, any>,
  ): void {
    const store = this.asyncStorage.getStore();
    const requestId = store?.requestId || 'unknown';
    const traceFilename = this.generateTraceFilename(requestId);
    const traceUrl = this.generateTraceUrl(requestId);
    const traceLogger = this.getTraceLogger(requestId);

    // Log error summary to application log
    const errorSummary = `ERROR ${req.method} ${req.url} ${res.statusCode} [${requestId}] ${error.message} trace:${traceUrl}`;
    this.applicationLogger.error(errorSummary, {
      requestId,
      error: error.name,
      message: error.message,
      traceFile: traceFilename,
      traceUrl,
    });

    // Log detailed error to trace log
    traceLogger.error('HTTP Request Error', {
      requestId,
      userId: store?.userId,
      correlationId: store?.correlationId,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      request: {
        method: req.method,
        url: req.url,
        headers: sanitizeForLogging(req.headers),
        query: sanitizeForLogging(req.query),
        body: sanitizeForLogging(req.body),
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      },
      response: {
        statusCode: res.statusCode,
      },
      timestamp: new Date().toISOString(),
      ...additionalData,
    });
  }
}
