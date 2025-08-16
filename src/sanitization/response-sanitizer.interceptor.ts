import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  getSanitizationConfig,
  SanitizationConfig,
} from '../config/sanitization.config';

@Injectable()
export class ResponseSanitizerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ResponseSanitizerInterceptor.name);
  private readonly config: SanitizationConfig;

  constructor() {
    this.config = getSanitizationConfig();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => {
        try {
          return this.sanitizeResponse(data);
        } catch (error) {
          this.logger.error(`Response sanitization failed: ${error.message}`, {
            error: error.stack,
            context: context.getClass().name,
            handler: context.getHandler().name,
          });

          // Return original data if sanitization fails
          return data;
        }
      }),
    );
  }

  private sanitizeResponse(data: any, visited = new WeakSet()): any {
    if (data === null || data === undefined) {
      return data;
    }

    // Handle primitive types
    if (typeof data !== 'object') {
      return data;
    }

    // Handle circular references
    if (visited.has(data)) {
      this.logger.warn('Circular reference detected in response sanitization');
      return '[Circular Reference]';
    }

    visited.add(data);

    try {
      // Handle arrays
      if (Array.isArray(data)) {
        const sanitizedArray = data.map((item) =>
          this.sanitizeResponse(item, visited),
        );
        visited.delete(data);
        return sanitizedArray;
      }

      // Handle Date objects
      if (data instanceof Date) {
        visited.delete(data);
        return data;
      }

      // Handle regular objects
      const sanitized: any = {};

      for (const [key, value] of Object.entries(data)) {
        // Skip sensitive fields
        if (this.config.redactFields.includes(key.toLowerCase())) {
          this.logger.debug(`Redacted sensitive field: ${key}`);
          continue; // Completely remove the field
        }

        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeResponse(value, visited);
      }

      visited.delete(data);
      return sanitized;
    } catch (error) {
      visited.delete(data);
      throw error;
    }
  }

  /**
   * Gets the list of fields that will be redacted from responses
   */
  getRedactedFields(): string[] {
    return [...this.config.redactFields];
  }
}
