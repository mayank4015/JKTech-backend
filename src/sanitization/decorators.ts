import { SetMetadata } from '@nestjs/common';
import 'reflect-metadata';

/**
 * Decorator to mark a field as containing HTML content that should be sanitized
 * with an allowlist instead of being stripped completely.
 */
export const IsHtml = (): PropertyDecorator => {
  return (target: any, propertyKey: string | symbol | undefined) => {
    if (propertyKey) {
      Reflect.defineMetadata('isHtml', true, target, propertyKey);
    }
  };
};

/**
 * Decorator to skip sanitization for a field entirely.
 * Use this for fields like signed payloads, encrypted data, or other sensitive content
 * that should not be modified.
 */
export const SkipSanitize = (): PropertyDecorator => {
  return (target: any, propertyKey: string | symbol | undefined) => {
    if (propertyKey) {
      Reflect.defineMetadata('skipSanitize', true, target, propertyKey);
    }
  };
};

// Metadata keys for reflection
export const IS_HTML_KEY = 'isHtml';
export const SKIP_SANITIZE_KEY = 'skipSanitize';
