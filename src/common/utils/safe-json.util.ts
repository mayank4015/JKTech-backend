/**
 * Safely stringify objects, handling circular references and errors
 */
export function safeStringify(obj: unknown, space?: number): string {
  const seen = new WeakSet<object>();

  try {
    return JSON.stringify(
      obj,
      (key: string, value: unknown) => {
        // Handle circular references
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }

        // Handle Error objects
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack,
            ...Object.getOwnPropertyNames(value).reduce(
              (acc: Record<string, unknown>, prop: string) => {
                acc[prop] = (value as unknown as Record<string, unknown>)[prop];
                return acc;
              },
              {},
            ),
          };
        }

        // Handle functions
        if (typeof value === 'function') {
          return '[Function]';
        }

        // Handle undefined
        if (value === undefined) {
          return '[Undefined]';
        }

        // Handle symbols
        if (typeof value === 'symbol') {
          return value.toString();
        }

        // Handle BigInt
        if (typeof value === 'bigint') {
          return value.toString();
        }

        return value;
      },
      space,
    );
  } catch {
    return '[Stringify Error: Unable to stringify object]';
  }
}

/**
 * Safely parse JSON strings
 */
export function safeParse<T = unknown>(str: string): T | null {
  try {
    return JSON.parse(str) as T;
  } catch {
    return null;
  }
}

/**
 * Prepare object for safe logging by removing sensitive data
 */
export function sanitizeForLogging<T>(obj: T): T {
  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'key',
    'authorization',
    'cookie',
    'session',
  ] as const;

  const sanitize = <U>(value: U): U => {
    if (value === null || value === undefined) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(sanitize) as U;
    }

    if (typeof value === 'object' && value.constructor === Object) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = sanitize(val);
        }
      }
      return sanitized as U;
    }

    return value;
  };

  return sanitize(obj);
}
