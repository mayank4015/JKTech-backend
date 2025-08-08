/**
 * Utility functions for handling BigInt serialization in API responses
 */

/**
 * Recursively converts BigInt values to strings in an object
 */
export function serializeBigInt<T>(obj: T, visited = new WeakSet()): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString() as unknown as T;
  }

  if (Array.isArray(obj)) {
    if (visited.has(obj)) {
      return '[Circular Reference]' as unknown as T;
    }
    visited.add(obj);
    const result = obj.map((item) =>
      serializeBigInt(item, visited),
    ) as unknown as T;
    visited.delete(obj);
    return result;
  }

  if (typeof obj === 'object') {
    if (visited.has(obj)) {
      return '[Circular Reference]' as unknown as T;
    }
    visited.add(obj);
    const serialized = {} as T;
    for (const [key, value] of Object.entries(obj)) {
      (serialized as Record<string, unknown>)[key] = serializeBigInt(
        value,
        visited,
      );
    }
    visited.delete(obj);
    return serialized;
  }

  return obj;
}

/**
 * Specifically handles Document objects with BigInt fileSize
 */
export function serializeDocument<T extends { fileSize?: bigint | string }>(
  document: T,
): T & { fileSize: string } {
  if (!document) {
    return { fileSize: 'undefined' } as T & { fileSize: string };
  }

  return {
    ...document,
    fileSize:
      typeof document.fileSize === 'bigint'
        ? document.fileSize.toString()
        : document.fileSize?.toString() || 'undefined',
  };
}

/**
 * Handles arrays of documents
 */
export function serializeDocuments<T extends { fileSize?: bigint | string }>(
  documents: T[],
): (T & { fileSize: string })[] {
  return documents
    .filter((doc) => doc !== null && doc !== undefined)
    .map(serializeDocument);
}
