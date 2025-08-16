import {
  Injectable,
  PipeTransform,
  ArgumentMetadata,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import 'reflect-metadata';
import { SanitizerService } from './sanitizer.service';
import { IS_HTML_KEY, SKIP_SANITIZE_KEY } from './decorators';

@Injectable()
export class SanitizePipe implements PipeTransform {
  private readonly logger = new Logger(SanitizePipe.name);

  constructor(
    private readonly sanitizerService: SanitizerService,
    private readonly reflector: Reflector,
  ) {}

  transform(value: any, metadata: ArgumentMetadata): any {
    // Skip sanitization for non-body parameters
    if (metadata.type !== 'body' || !value || typeof value !== 'object') {
      return value;
    }

    try {
      return this.sanitizeObject(value, metadata.metatype);
    } catch (error) {
      this.logger.error(`Sanitization failed: ${error.message}`, {
        error: error.stack,
        metadata,
      });

      // Return the original value if sanitization fails
      return value;
    }
  }

  private sanitizeObject(obj: any, metatype?: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item, metatype));
    }

    const sanitized: any = {};

    for (const [key, value] of Object.entries(obj)) {
      // Check metadata for this specific property
      let skipSanitize = false;
      let isHtml = false;

      if (metatype) {
        try {
          // Get metadata from the property descriptor using Reflect directly
          skipSanitize =
            Reflect.getMetadata(SKIP_SANITIZE_KEY, metatype.prototype, key) ||
            false;
          isHtml =
            Reflect.getMetadata(IS_HTML_KEY, metatype.prototype, key) || false;
        } catch (error) {
          // If reflection fails, continue with normal sanitization
          this.logger.debug(
            `Reflection failed for property ${key}: ${error.message}`,
          );
        }
      }

      if (skipSanitize) {
        sanitized[key] = value;
        continue;
      }

      if (typeof value === 'string') {
        if (isHtml) {
          // Sanitize HTML content with allowlist
          sanitized[key] = this.sanitizerService.sanitizeHtmlField(value);
        } else {
          // Normal string sanitization (normalize only)
          sanitized[key] = this.sanitizerService.normalizeString(value);
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        sanitized[key] = this.sanitizeObject(value);
      } else {
        // Keep primitive values as-is (numbers, booleans, etc.)
        sanitized[key] = value;
      }
    }

    // Apply deep cleaning for MongoDB protection and final sanitization
    return this.sanitizerService.deepClean(sanitized);
  }
}
