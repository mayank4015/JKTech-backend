import {
  serializeBigInt,
  serializeDocument,
  serializeDocuments,
} from './bigint-serializer.util';

describe('BigInt Serializer Utility', () => {
  describe('serializeBigInt', () => {
    describe('Positive Cases', () => {
      it('should convert BigInt to string', () => {
        const input = BigInt(123456789);
        const result = serializeBigInt(input);

        expect(result).toBe('123456789');
        expect(typeof result).toBe('string');
      });

      it('should handle null values', () => {
        const result = serializeBigInt(null);
        expect(result).toBeNull();
      });

      it('should handle undefined values', () => {
        const result = serializeBigInt(undefined);
        expect(result).toBeUndefined();
      });

      it('should handle primitive values unchanged', () => {
        expect(serializeBigInt('string')).toBe('string');
        expect(serializeBigInt(123)).toBe(123);
        expect(serializeBigInt(true)).toBe(true);
        expect(serializeBigInt(false)).toBe(false);
      });

      it('should serialize BigInt in arrays', () => {
        const input = [BigInt(123), 'string', 456, BigInt(789)];
        const result = serializeBigInt(input);

        expect(result).toEqual(['123', 'string', 456, '789']);
      });

      it('should serialize BigInt in nested arrays', () => {
        const input = [
          [BigInt(123), BigInt(456)],
          ['string', BigInt(789)],
        ];
        const result = serializeBigInt(input);

        expect(result).toEqual([
          ['123', '456'],
          ['string', '789'],
        ]);
      });

      it('should serialize BigInt in objects', () => {
        const input = {
          id: BigInt(123),
          name: 'test',
          count: 456,
          size: BigInt(789),
        };
        const result = serializeBigInt(input);

        expect(result).toEqual({
          id: '123',
          name: 'test',
          count: 456,
          size: '789',
        });
      });

      it('should serialize BigInt in nested objects', () => {
        const input = {
          user: {
            id: BigInt(123),
            profile: {
              fileSize: BigInt(456789),
              name: 'test',
            },
          },
          metadata: {
            count: BigInt(999),
          },
        };
        const result = serializeBigInt(input);

        expect(result).toEqual({
          user: {
            id: '123',
            profile: {
              fileSize: '456789',
              name: 'test',
            },
          },
          metadata: {
            count: '999',
          },
        });
      });

      it('should handle complex mixed data structures', () => {
        const input = {
          items: [
            { id: BigInt(1), data: [BigInt(100), 'text'] },
            { id: BigInt(2), data: [BigInt(200), 'more text'] },
          ],
          total: BigInt(300),
          metadata: {
            sizes: [BigInt(10), BigInt(20), BigInt(30)],
          },
        };
        const result = serializeBigInt(input);

        expect(result).toEqual({
          items: [
            { id: '1', data: ['100', 'text'] },
            { id: '2', data: ['200', 'more text'] },
          ],
          total: '300',
          metadata: {
            sizes: ['10', '20', '30'],
          },
        });
      });

      it('should handle empty objects and arrays', () => {
        expect(serializeBigInt({})).toEqual({});
        expect(serializeBigInt([])).toEqual([]);
      });
    });

    describe('Negative Cases', () => {
      it('should handle objects with circular references gracefully', () => {
        const obj: Record<string, unknown> = { id: BigInt(123) };
        obj.self = obj; // Create circular reference

        // Should not throw an error and should serialize the non-circular parts
        expect(() => serializeBigInt(obj)).not.toThrow();
      });

      it('should handle very large BigInt values', () => {
        const largeBigInt = BigInt('999999999999999999999999999999');
        const result = serializeBigInt(largeBigInt);

        expect(result).toBe('999999999999999999999999999999');
        expect(typeof result).toBe('string');
      });

      it('should handle negative BigInt values', () => {
        const negativeBigInt = BigInt(-123456789);
        const result = serializeBigInt(negativeBigInt);

        expect(result).toBe('-123456789');
        expect(typeof result).toBe('string');
      });

      it('should handle zero BigInt', () => {
        const zeroBigInt = BigInt(0);
        const result = serializeBigInt(zeroBigInt);

        expect(result).toBe('0');
        expect(typeof result).toBe('string');
      });

      it('should handle objects with prototype pollution attempts', () => {
        const maliciousObj = {
          __proto__: { polluted: true },
          id: BigInt(123),
        };

        const result = serializeBigInt(maliciousObj);
        expect(result).toHaveProperty('id', '123');
        expect(result).not.toHaveProperty('polluted');
      });
    });
  });

  describe('serializeDocument', () => {
    describe('Positive Cases', () => {
      it('should serialize document with BigInt fileSize', () => {
        const document = {
          id: 'doc-1',
          title: 'Test Document',
          fileSize: BigInt(1024),
          fileName: 'test.pdf',
        };

        const result = serializeDocument(document);

        expect(result).toEqual({
          id: 'doc-1',
          title: 'Test Document',
          fileSize: '1024',
          fileName: 'test.pdf',
        });
        expect(typeof result.fileSize).toBe('string');
      });

      it('should handle document with string fileSize', () => {
        const document = {
          id: 'doc-1',
          title: 'Test Document',
          fileSize: '2048',
          fileName: 'test.pdf',
        };

        const result = serializeDocument(document);

        expect(result).toEqual({
          id: 'doc-1',
          title: 'Test Document',
          fileSize: '2048',
          fileName: 'test.pdf',
        });
        expect(typeof result.fileSize).toBe('string');
      });

      it('should handle document without fileSize', () => {
        const document = {
          id: 'doc-1',
          title: 'Test Document',
          fileName: 'test.pdf',
        } as {
          fileSize?: bigint | string;
          id: string;
          title: string;
          fileName: string;
        };

        const result = serializeDocument(document);

        expect(result).toEqual({
          id: 'doc-1',
          title: 'Test Document',
          fileName: 'test.pdf',
          fileSize: 'undefined',
        });
      });

      it('should preserve all other document properties', () => {
        const document = {
          id: 'doc-1',
          title: 'Test Document',
          description: 'A test document',
          fileSize: BigInt(4096),
          fileName: 'test.pdf',
          fileType: 'application/pdf',
          uploadedBy: 'user-1',
          createdAt: new Date('2024-01-01'),
          tags: ['test', 'document'],
        };

        const result = serializeDocument(document);

        expect(result).toEqual({
          id: 'doc-1',
          title: 'Test Document',
          description: 'A test document',
          fileSize: '4096',
          fileName: 'test.pdf',
          fileType: 'application/pdf',
          uploadedBy: 'user-1',
          createdAt: new Date('2024-01-01'),
          tags: ['test', 'document'],
        });
      });
    });

    describe('Negative Cases', () => {
      it('should handle document with zero fileSize', () => {
        const document = {
          id: 'doc-1',
          fileSize: BigInt(0),
        };

        const result = serializeDocument(document);
        expect(result.fileSize).toBe('0');
      });

      it('should handle document with negative fileSize', () => {
        const document = {
          id: 'doc-1',
          fileSize: BigInt(-100),
        };

        const result = serializeDocument(document);
        expect(result.fileSize).toBe('-100');
      });

      it('should handle document with very large fileSize', () => {
        const document = {
          id: 'doc-1',
          fileSize: BigInt('999999999999999999'),
        };

        const result = serializeDocument(document);
        expect(result.fileSize).toBe('999999999999999999');
      });

      it('should handle empty document object', () => {
        const document = {} as { fileSize?: bigint | string };

        const result = serializeDocument(document);
        expect(result).toEqual({
          fileSize: 'undefined',
        });
      });
    });
  });

  describe('serializeDocuments', () => {
    describe('Positive Cases', () => {
      it('should serialize array of documents', () => {
        const documents = [
          {
            id: 'doc-1',
            title: 'Document 1',
            fileSize: BigInt(1024),
          },
          {
            id: 'doc-2',
            title: 'Document 2',
            fileSize: BigInt(2048),
          },
        ];

        const result = serializeDocuments(documents);

        expect(result).toEqual([
          {
            id: 'doc-1',
            title: 'Document 1',
            fileSize: '1024',
          },
          {
            id: 'doc-2',
            title: 'Document 2',
            fileSize: '2048',
          },
        ]);
      });

      it('should handle mixed fileSize types in array', () => {
        const documents = [
          {
            id: 'doc-1',
            fileSize: BigInt(1024),
          },
          {
            id: 'doc-2',
            fileSize: '2048',
          },
          {
            id: 'doc-3',
            // No fileSize property
          },
        ];

        const result = serializeDocuments(documents);

        expect(result).toEqual([
          {
            id: 'doc-1',
            fileSize: '1024',
          },
          {
            id: 'doc-2',
            fileSize: '2048',
          },
          {
            id: 'doc-3',
            fileSize: 'undefined',
          },
        ]);
      });

      it('should handle empty array', () => {
        const result = serializeDocuments([]);
        expect(result).toEqual([]);
      });
    });

    describe('Negative Cases', () => {
      it('should handle array with null/undefined documents', () => {
        const documents = [
          { id: 'doc-1', fileSize: BigInt(1024) },
          null as unknown as { fileSize?: bigint | string },
          undefined as unknown as { fileSize?: bigint | string },
          { id: 'doc-2', fileSize: BigInt(2048) },
        ];

        const result = serializeDocuments(documents);

        expect(result).toHaveLength(2); // null and undefined are filtered out
        expect(result[0]).toEqual({ id: 'doc-1', fileSize: '1024' });
        expect(result[1]).toEqual({ id: 'doc-2', fileSize: '2048' });
      });

      it('should handle large array of documents', () => {
        const documents = Array.from({ length: 1000 }, (_, index) => ({
          id: `doc-${index}`,
          fileSize: BigInt(index * 1024),
        }));

        const result = serializeDocuments(documents);

        expect(result).toHaveLength(1000);
        expect(result[0]).toEqual({ id: 'doc-0', fileSize: '0' });
        expect(result[999]).toEqual({ id: 'doc-999', fileSize: '1022976' });
      });
    });
  });
});
