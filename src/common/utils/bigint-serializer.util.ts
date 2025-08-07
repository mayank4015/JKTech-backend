/**
 * Utility functions for handling BigInt serialization in API responses
 */

/**
 * Recursively converts BigInt values to strings in an object
 */
export function serializeBigInt<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString() as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt) as unknown as T;
  }

  if (typeof obj === 'object') {
    const serialized = {} as T;
    for (const [key, value] of Object.entries(obj)) {
      (serialized as any)[key] = serializeBigInt(value);
    }
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
  return {
    ...document,
    fileSize:
      typeof document.fileSize === 'bigint'
        ? document.fileSize.toString()
        : (document.fileSize as string),
  };
}

/**
 * Handles arrays of documents
 */
export function serializeDocuments<T extends { fileSize?: bigint | string }>(
  documents: T[],
): (T & { fileSize: string })[] {
  return documents.map(serializeDocument);
}
