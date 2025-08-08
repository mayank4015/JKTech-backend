import {
  transformDocumentForFrontend,
  transformDocumentsForFrontend,
  DocumentWithUploader,
  FrontendDocument,
} from './document-transformer.util';

describe('Document Transformer Utility', () => {
  // Restore original Date constructor for this test suite
  const OriginalDate = Date;
  beforeAll(() => {
    global.Date = OriginalDate as DateConstructor;
  });

  const mockDate = new OriginalDate('2024-01-01T00:00:00.000Z');

  const createMockDocumentWithUploader = (
    overrides: Partial<DocumentWithUploader> = {},
  ): DocumentWithUploader => ({
    id: 'doc-123',
    title: 'Test Document',
    description: 'A test document',
    fileName: 'test-document.pdf',
    fileUrl: 'https://example.com/files/test-document.pdf',
    fileType: 'application/pdf',
    fileSize: '1048576', // 1MB as string
    uploadedBy: 'user-123',
    createdAt: mockDate,
    updatedAt: mockDate,
    status: 'processed',
    tags: ['test', 'document'],
    category: 'work',
    uploader: {
      id: 'user-123',
      name: 'John Doe',
      email: 'john@example.com',
    },
    ...overrides,
  });

  describe('transformDocumentForFrontend', () => {
    describe('Positive Cases', () => {
      it('should transform complete document with all fields', () => {
        const document = createMockDocumentWithUploader();

        const result = transformDocumentForFrontend(document);

        expect(result).toEqual({
          id: 'doc-123',
          title: 'Test Document',
          description: 'A test document',
          fileName: 'test-document.pdf',
          fileUrl: 'https://example.com/files/test-document.pdf',
          fileType: 'application/pdf',
          fileSize: 1048576, // Converted to number
          uploadedBy: 'user-123',
          uploadedByName: 'John Doe',
          createdAt: mockDate,
          updatedAt: mockDate,
          status: 'processed',
          tags: ['test', 'document'],
          category: 'work',
          processingProgress: 0,
          errorMessage: undefined,
        });
      });

      it('should handle document without optional fields', () => {
        const document = createMockDocumentWithUploader({
          description: null,
          category: null,
        });

        const result = transformDocumentForFrontend(document);

        expect(result.description).toBeUndefined();
        expect(result.category).toBeUndefined();
      });

      it('should handle different document statuses', () => {
        const statuses = [
          'pending',
          'processing',
          'processed',
          'failed',
        ] as const;

        statuses.forEach((status) => {
          const document = createMockDocumentWithUploader({ status });
          const result = transformDocumentForFrontend(document);

          expect(result.status).toBe(status);
        });
      });

      it('should convert string fileSize to number', () => {
        const document = createMockDocumentWithUploader({
          fileSize: '2097152', // 2MB as string
        });

        const result = transformDocumentForFrontend(document);

        expect(result.fileSize).toBe(2097152);
        expect(typeof result.fileSize).toBe('number');
      });

      it('should handle Date objects for timestamps', () => {
        const createdAt = new OriginalDate('2024-06-15T10:30:00.000Z');
        const updatedAt = new OriginalDate('2024-06-15T11:45:00.000Z');

        const document = createMockDocumentWithUploader({
          createdAt,
          updatedAt,
        });

        const result = transformDocumentForFrontend(document);

        expect(result.createdAt).toBe(createdAt);
        expect(result.updatedAt).toBe(updatedAt);
      });

      it('should handle string timestamps', () => {
        const document = createMockDocumentWithUploader({
          createdAt: '2024-06-15T10:30:00.000Z' as unknown as Date,
          updatedAt: '2024-06-15T11:45:00.000Z' as unknown as Date,
        });

        const result = transformDocumentForFrontend(document);

        expect(result.createdAt).toBe('2024-06-15T10:30:00.000Z');
        expect(result.updatedAt).toBe('2024-06-15T11:45:00.000Z');
      });

      it('should handle empty tags array', () => {
        const document = createMockDocumentWithUploader({
          tags: [],
        });

        const result = transformDocumentForFrontend(document);

        expect(result.tags).toEqual([]);
      });

      it('should handle multiple tags', () => {
        const document = createMockDocumentWithUploader({
          tags: ['work', 'important', 'pdf', 'report', '2024'],
        });

        const result = transformDocumentForFrontend(document);

        expect(result.tags).toEqual([
          'work',
          'important',
          'pdf',
          'report',
          '2024',
        ]);
      });

      it('should preserve uploader information', () => {
        const document = createMockDocumentWithUploader({
          uploader: {
            id: 'user-456',
            name: 'Jane Smith',
            email: 'jane@example.com',
          },
        });

        const result = transformDocumentForFrontend(document);

        expect(result.uploadedByName).toBe('Jane Smith');
      });

      it('should set default processing progress to 0', () => {
        const document = createMockDocumentWithUploader();

        const result = transformDocumentForFrontend(document);

        expect(result.processingProgress).toBe(0);
      });

      it('should set default error message to undefined', () => {
        const document = createMockDocumentWithUploader();

        const result = transformDocumentForFrontend(document);

        expect(result.errorMessage).toBeUndefined();
      });
    });

    describe('Negative Cases', () => {
      it('should handle zero fileSize', () => {
        const document = createMockDocumentWithUploader({
          fileSize: '0',
        });

        const result = transformDocumentForFrontend(document);

        expect(result.fileSize).toBe(0);
      });

      it('should handle very large fileSize', () => {
        const document = createMockDocumentWithUploader({
          fileSize: '999999999999', // Very large file
        });

        const result = transformDocumentForFrontend(document);

        expect(result.fileSize).toBe(999999999999);
      });

      it('should handle invalid fileSize string', () => {
        const document = createMockDocumentWithUploader({
          fileSize: 'invalid-size',
        });

        const result = transformDocumentForFrontend(document);

        expect(result.fileSize).toBeNaN();
      });

      it('should handle empty string fileSize', () => {
        const document = createMockDocumentWithUploader({
          fileSize: '',
        });

        const result = transformDocumentForFrontend(document);

        expect(result.fileSize).toBeNaN();
      });

      it('should handle negative fileSize', () => {
        const document = createMockDocumentWithUploader({
          fileSize: '-1024',
        });

        const result = transformDocumentForFrontend(document);

        expect(result.fileSize).toBe(-1024);
      });

      it('should handle fractional fileSize', () => {
        const document = createMockDocumentWithUploader({
          fileSize: '1024.5',
        });

        const result = transformDocumentForFrontend(document);

        expect(result.fileSize).toBe(1024); // parseInt truncates decimals
      });

      it('should handle undefined description', () => {
        const document = createMockDocumentWithUploader({
          description: undefined,
        });

        const result = transformDocumentForFrontend(document);

        expect(result.description).toBeUndefined();
      });

      it('should handle empty string description', () => {
        const document = createMockDocumentWithUploader({
          description: '',
        });

        const result = transformDocumentForFrontend(document);

        expect(result.description).toBeUndefined();
      });

      it('should handle undefined category', () => {
        const document = createMockDocumentWithUploader({
          category: undefined,
        });

        const result = transformDocumentForFrontend(document);

        expect(result.category).toBeUndefined();
      });

      it('should handle empty string category', () => {
        const document = createMockDocumentWithUploader({
          category: '',
        });

        const result = transformDocumentForFrontend(document);

        expect(result.category).toBeUndefined();
      });

      it('should handle invalid status values', () => {
        const document = createMockDocumentWithUploader({
          status: 'invalid-status' as unknown as 'pending',
        });

        const result = transformDocumentForFrontend(document);

        expect(result.status).toBe('invalid-status');
      });

      it('should handle missing uploader name', () => {
        const document = createMockDocumentWithUploader({
          uploader: {
            id: 'user-123',
            name: '',
            email: 'user@example.com',
          },
        });

        const result = transformDocumentForFrontend(document);

        expect(result.uploadedByName).toBe('');
      });

      it('should handle null uploader', () => {
        const document = createMockDocumentWithUploader({
          uploader: null as unknown as DocumentWithUploader['uploader'],
        });

        expect(() => transformDocumentForFrontend(document)).toThrow();
      });

      it('should handle invalid date objects', () => {
        const document = createMockDocumentWithUploader({
          createdAt: new OriginalDate('invalid-date'),
          updatedAt: new OriginalDate('invalid-date'),
        });

        const result = transformDocumentForFrontend(document);

        expect(result.createdAt).toBe(mockDate);
        expect(result.updatedAt).toBe(mockDate);
      });
    });
  });

  describe('transformDocumentsForFrontend', () => {
    describe('Positive Cases', () => {
      it('should transform array of documents', () => {
        const documents = [
          createMockDocumentWithUploader({
            id: 'doc-1',
            title: 'Document 1',
            fileSize: '1024',
          }),
          createMockDocumentWithUploader({
            id: 'doc-2',
            title: 'Document 2',
            fileSize: '2048',
          }),
        ];

        const result = transformDocumentsForFrontend(documents);

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('doc-1');
        expect(result[0].title).toBe('Document 1');
        expect(result[0].fileSize).toBe(1024);
        expect(result[1].id).toBe('doc-2');
        expect(result[1].title).toBe('Document 2');
        expect(result[1].fileSize).toBe(2048);
      });

      it('should handle single document in array', () => {
        const documents = [createMockDocumentWithUploader()];

        const result = transformDocumentsForFrontend(documents);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('doc-123');
      });

      it('should handle empty array', () => {
        const result = transformDocumentsForFrontend([]);

        expect(result).toEqual([]);
      });

      it('should handle large array of documents', () => {
        const documents = Array.from({ length: 100 }, (_, index) =>
          createMockDocumentWithUploader({
            id: `doc-${index}`,
            title: `Document ${index}`,
            fileSize: `${(index + 1) * 1024}`,
          }),
        );

        const result = transformDocumentsForFrontend(documents);

        expect(result).toHaveLength(100);
        expect(result[0].id).toBe('doc-0');
        expect(result[0].fileSize).toBe(1024);
        expect(result[99].id).toBe('doc-99');
        expect(result[99].fileSize).toBe(102400);
      });

      it('should handle documents with different statuses', () => {
        const documents = [
          createMockDocumentWithUploader({ status: 'pending' }),
          createMockDocumentWithUploader({ status: 'processing' }),
          createMockDocumentWithUploader({ status: 'processed' }),
          createMockDocumentWithUploader({ status: 'failed' }),
        ];

        const result = transformDocumentsForFrontend(documents);

        expect(result[0].status).toBe('pending');
        expect(result[1].status).toBe('processing');
        expect(result[2].status).toBe('processed');
        expect(result[3].status).toBe('failed');
      });

      it('should handle documents with different file types', () => {
        const documents = [
          createMockDocumentWithUploader({
            fileName: 'document.pdf',
            fileType: 'application/pdf',
          }),
          createMockDocumentWithUploader({
            fileName: 'image.jpg',
            fileType: 'image/jpeg',
          }),
          createMockDocumentWithUploader({
            fileName: 'spreadsheet.xlsx',
            fileType:
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
        ];

        const result = transformDocumentsForFrontend(documents);

        expect(result[0].fileType).toBe('application/pdf');
        expect(result[1].fileType).toBe('image/jpeg');
        expect(result[2].fileType).toBe(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
      });
    });

    describe('Negative Cases', () => {
      it('should handle array with mixed valid and invalid documents', () => {
        const documents = [
          createMockDocumentWithUploader({ id: 'doc-1' }),
          createMockDocumentWithUploader({
            id: 'doc-2',
            fileSize: 'invalid-size',
          }),
          createMockDocumentWithUploader({ id: 'doc-3' }),
        ];

        const result = transformDocumentsForFrontend(documents);

        expect(result).toHaveLength(3);
        expect(result[0].id).toBe('doc-1');
        expect(result[1].id).toBe('doc-2');
        expect(result[1].fileSize).toBeNaN();
        expect(result[2].id).toBe('doc-3');
      });

      it('should handle documents with null/undefined optional fields', () => {
        const documents = [
          createMockDocumentWithUploader({
            description: null,
            category: null,
          }),
          createMockDocumentWithUploader({
            description: undefined,
            category: undefined,
          }),
        ];

        const result = transformDocumentsForFrontend(documents);

        expect(result[0].description).toBeUndefined();
        expect(result[0].category).toBeUndefined();
        expect(result[1].description).toBeUndefined();
        expect(result[1].category).toBeUndefined();
      });

      it('should handle documents with empty tags', () => {
        const documents = [
          createMockDocumentWithUploader({ tags: [] }),
          createMockDocumentWithUploader({ tags: [''] }),
          createMockDocumentWithUploader({ tags: ['tag1', '', 'tag2'] }),
        ];

        const result = transformDocumentsForFrontend(documents);

        expect(result[0].tags).toEqual([]);
        expect(result[1].tags).toEqual(['']);
        expect(result[2].tags).toEqual(['tag1', '', 'tag2']);
      });

      it('should handle documents with zero or negative file sizes', () => {
        const documents = [
          createMockDocumentWithUploader({ fileSize: '0' }),
          createMockDocumentWithUploader({ fileSize: '-1024' }),
        ];

        const result = transformDocumentsForFrontend(documents);

        expect(result[0].fileSize).toBe(0);
        expect(result[1].fileSize).toBe(-1024);
      });

      it('should handle documents with invalid dates', () => {
        const documents = [
          createMockDocumentWithUploader({
            createdAt: new OriginalDate('invalid-date'),
            updatedAt: new OriginalDate('invalid-date'),
          }),
        ];

        const result = transformDocumentsForFrontend(documents);

        expect(result[0].createdAt).toBe(mockDate);
        expect(result[0].updatedAt).toBe(mockDate);
      });

      it('should handle very large arrays efficiently', () => {
        const documents = Array.from({ length: 10000 }, (_, index) =>
          createMockDocumentWithUploader({
            id: `doc-${index}`,
            fileSize: `${index}`,
          }),
        );

        const startTime = Date.now();
        const result = transformDocumentsForFrontend(documents);
        const endTime = Date.now();

        expect(result).toHaveLength(10000);
        expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      });
    });
  });
});
