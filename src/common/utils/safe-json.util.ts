/**
 * Safely stringify objects, handling circular references and errors
 */
export function safeStringify(obj: any, space?: number): string {
  const seen = new WeakSet();

  try {
    return JSON.stringify(
      obj,
      (key, value) => {
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
            ...Object.getOwnPropertyNames(value).reduce((acc, prop) => {
              acc[prop] = value[prop];
              return acc;
            }, {}),
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
export function safeParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Prepare object for safe logging by removing sensitive data
 */
export function sanitizeForLogging(obj: any): any {
  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'key',
    'authorization',
    'cookie',
    'session',
  ];

  const sanitize = (value: any): any => {
    if (value === null || value === undefined) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(sanitize);
    }

    if (typeof value === 'object') {
      const sanitized = {};
      for (const [key, val] of Object.entries(value)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
          sanitized[key] = '[REDACTED]';
        } else {
          sanitized[key] = sanitize(val);
        }
      }
      return sanitized;
    }

    return value;
  };

  return sanitize(obj);
}
