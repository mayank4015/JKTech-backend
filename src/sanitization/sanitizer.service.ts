import { Injectable, Logger } from '@nestjs/common';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';
import {
  getSanitizationConfig,
  SanitizationConfig,
} from '../config/sanitization.config';

@Injectable()
export class SanitizerService {
  private readonly logger = new Logger(SanitizerService.name);
  private readonly config: SanitizationConfig;
  private readonly domPurify: any;

  constructor() {
    this.config = getSanitizationConfig();

    // Initialize DOMPurify with JSDOM window
    const window = new JSDOM('').window;
    this.domPurify = DOMPurify(window as any);

    // Configure DOMPurify with allowlist
    this.domPurify.addHook('uponSanitizeElement', (node, data) => {
      if (
        data.tagName &&
        !this.config.htmlAllowlist.includes(data.tagName.toLowerCase())
      ) {
        return node.remove();
      }
    });
  }

  /**
   * Normalizes a string by trimming whitespace and collapsing multiple spaces
   */
  normalizeString(input: string): string {
    if (typeof input !== 'string') {
      return input;
    }

    return input.trim().replace(/\s+/g, ' '); // Collapse multiple whitespace characters
  }

  /**
   * Sanitizes HTML content using DOMPurify with configured allowlist
   */
  sanitizeHTML(input: string): string {
    if (!this.config.htmlSanitizationEnabled || typeof input !== 'string') {
      return input;
    }

    try {
      const sanitized = this.domPurify.sanitize(input, {
        ALLOWED_TAGS: this.config.htmlAllowlist,
        ALLOWED_ATTR: ['href', 'title', 'alt'], // Basic safe attributes
        KEEP_CONTENT: true, // Keep text content even if tags are removed
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false,
      });

      return sanitized;
    } catch (error) {
      this.logger.warn(`HTML sanitization failed: ${error.message}`, {
        input: input.substring(0, 100) + '...',
      });

      // Fallback: strip all HTML tags
      return input.replace(/<[^>]*>/g, '');
    }
  }

  /**
   * Removes dangerous MongoDB operators and keys that could lead to injection
   */
  private removeDangerousKeys(obj: Record<string, any>): Record<string, any> {
    if (!this.config.mongoProtectionEnabled) {
      return obj;
    }

    const cleaned: Record<string, any> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Skip keys that start with $ (MongoDB operators) or contain dots
      if (key.startsWith('$') || key.includes('.')) {
        this.logger.warn(`Removed dangerous key: ${key}`);
        continue;
      }

      cleaned[key] = value;
    }

    return cleaned;
  }

  /**
   * Deep cleans an object or value recursively without mutating the original
   */
  deepClean<T>(value: T, visited = new WeakSet()): T {
    // Handle null, undefined, and primitive types
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return this.normalizeString(value) as T;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    // Handle special object types first (before circular reference check)
    if (
      value instanceof Date ||
      value instanceof RegExp ||
      value instanceof Error
    ) {
      return value;
    }

    // Handle circular references
    if (typeof value === 'object' && visited.has(value as object)) {
      this.logger.warn('Circular reference detected during sanitization');
      return value;
    }

    if (typeof value === 'object') {
      visited.add(value as object);
    }

    // Handle arrays
    if (Array.isArray(value)) {
      const cleanedArray = value.map((item) => this.deepClean(item, visited));
      visited.delete(value as object);
      return cleanedArray as T;
    }

    // Handle regular objects
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, any>;

      // Remove dangerous MongoDB keys first
      const safeObj = this.removeDangerousKeys(obj);

      // Deep clean all values
      const cleaned: Record<string, any> = {};
      for (const [key, val] of Object.entries(safeObj)) {
        cleaned[key] = this.deepClean(val, visited);
      }

      visited.delete(value as object);
      return cleaned as T;
    }

    return value;
  }

  /**
   * Sanitizes HTML content specifically (used by pipe for @IsHtml decorated fields)
   */
  sanitizeHtmlField(input: string): string {
    if (typeof input !== 'string') {
      return input;
    }

    // First normalize the string
    const normalized = this.normalizeString(input);

    // Then sanitize HTML
    return this.sanitizeHTML(normalized);
  }

  /**
   * Gets the current sanitization configuration
   */
  getConfig(): SanitizationConfig {
    return { ...this.config };
  }
}
