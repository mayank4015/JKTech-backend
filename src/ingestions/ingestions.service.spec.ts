import { Test, TestingModule } from '@nestjs/testing';
import { IngestionsService } from './ingestions.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import { ProcessingQueueService } from '../common/queues/processing-queue.service';
import { IngestionStatus } from './dto';

describe('IngestionsService - QA Integration', () => {
  let service: IngestionsService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    ingestion: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    document: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockLoggerService = {
    debug: jest.fn(),
    log: jest.fn(),
    error: jest.fn(),
  };

  const mockProcessingQueueService = {
    addDocumentProcessingJob: jest.fn(),
    cancelJob: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: ProcessingQueueService,
          useValue: mockProcessingQueueService,
        },
      ],
    }).compile();

    service = module.get<IngestionsService>(IngestionsService);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('getProcessedContent', () => {
    it('should return processed content for a document', async () => {
      const documentId = 'doc-1';
      const mockIngestion = {
        id: 'ingestion-1',
        documentId,
        status: IngestionStatus.COMPLETED,
        logs: {
          processingResult: {
            extractedText: 'This is extracted text from the document',
            summary: 'Document summary',
            keywords: ['keyword1', 'keyword2'],
            language: 'en',
            ocrText: 'OCR extracted text',
          },
        },
      };

      mockPrismaService.ingestion.findFirst.mockResolvedValue(mockIngestion);

      const result = await service.getProcessedContent(documentId);

      expect(mockPrismaService.ingestion.findFirst).toHaveBeenCalledWith({
        where: {
          documentId,
          status: IngestionStatus.COMPLETED,
        },
        orderBy: {
          completedAt: 'desc',
        },
      });

      expect(result).toEqual({
        extractedText: 'This is extracted text from the document',
        summary: 'Document summary',
        keywords: ['keyword1', 'keyword2'],
        language: 'en',
        ocrText: 'OCR extracted text',
      });
    });

    it('should return null when no completed ingestion exists', async () => {
      const documentId = 'doc-1';

      mockPrismaService.ingestion.findFirst.mockResolvedValue(null);

      const result = await service.getProcessedContent(documentId);

      expect(result).toBeNull();
    });

    it('should handle legacy ingestion data format', async () => {
      const documentId = 'doc-1';
      const mockIngestion = {
        id: 'ingestion-1',
        documentId,
        status: IngestionStatus.COMPLETED,
        logs: {
          extractedText: 'Legacy extracted text', // Old format
          processingResult: null,
        },
      };

      mockPrismaService.ingestion.findFirst.mockResolvedValue(mockIngestion);

      const result = await service.getProcessedContent(documentId);

      expect(result).toEqual({
        extractedText: 'Legacy extracted text',
        summary: undefined,
        keywords: [],
        language: undefined,
        ocrText: undefined,
      });
    });
  });

  describe('getProcessedContentBatch', () => {
    it('should return processed content for multiple documents', async () => {
      const documentIds = ['doc-1', 'doc-2'];
      const mockIngestions = [
        {
          id: 'ingestion-1',
          documentId: 'doc-1',
          status: IngestionStatus.COMPLETED,
          completedAt: new Date('2023-01-02'),
          logs: {
            processingResult: {
              extractedText: 'Text from doc 1',
              summary: 'Summary 1',
              keywords: ['key1'],
            },
          },
        },
        {
          id: 'ingestion-2',
          documentId: 'doc-2',
          status: IngestionStatus.COMPLETED,
          completedAt: new Date('2023-01-01'),
          logs: {
            processingResult: {
              extractedText: 'Text from doc 2',
              summary: 'Summary 2',
              keywords: ['key2'],
            },
          },
        },
        {
          id: 'ingestion-3',
          documentId: 'doc-1', // Older ingestion for doc-1
          status: IngestionStatus.COMPLETED,
          completedAt: new Date('2023-01-01'),
          logs: {
            processingResult: {
              extractedText: 'Old text from doc 1',
            },
          },
        },
      ];

      mockPrismaService.ingestion.findMany.mockResolvedValue(mockIngestions);

      const result = await service.getProcessedContentBatch(documentIds);

      expect(mockPrismaService.ingestion.findMany).toHaveBeenCalledWith({
        where: {
          documentId: { in: documentIds },
          status: IngestionStatus.COMPLETED,
        },
        orderBy: {
          completedAt: 'desc',
        },
      });

      expect(result.size).toBe(2);
      expect(result.get('doc-1')).toEqual({
        extractedText: 'Text from doc 1', // Should use latest ingestion
        summary: 'Summary 1',
        keywords: ['key1'],
        language: undefined,
        ocrText: undefined,
      });
      expect(result.get('doc-2')).toEqual({
        extractedText: 'Text from doc 2',
        summary: 'Summary 2',
        keywords: ['key2'],
        language: undefined,
        ocrText: undefined,
      });
    });

    it('should handle empty document list', async () => {
      const result = await service.getProcessedContentBatch([]);

      expect(result.size).toBe(0);
      // Should not call Prisma when no documents provided
      expect(mockPrismaService.ingestion.findMany).not.toHaveBeenCalled();
    });
  });

  describe('searchProcessedContent', () => {
    it('should search through processed content and return relevant results', async () => {
      const query = 'machine learning';
      const userId = 'user-1';
      const limit = 5;

      const mockIngestions = [
        {
          id: 'ingestion-1',
          documentId: 'doc-1',
          userId,
          status: IngestionStatus.COMPLETED,
          logs: {
            processingResult: {
              extractedText:
                'This document covers machine learning algorithms and techniques.',
              summary: 'ML guide',
              keywords: ['machine', 'learning', 'algorithms'],
            },
          },
          document: {
            id: 'doc-1',
            title: 'Machine Learning Guide',
            description: 'Comprehensive ML guide',
            tags: ['ml', 'ai'],
          },
        },
        {
          id: 'ingestion-2',
          documentId: 'doc-2',
          userId,
          status: IngestionStatus.COMPLETED,
          logs: {
            processingResult: {
              extractedText: 'This is about artificial intelligence.',
              summary: 'AI overview',
              keywords: ['artificial', 'intelligence'],
            },
          },
          document: {
            id: 'doc-2',
            title: 'AI Overview',
            description: 'Overview of AI',
            tags: ['ai'],
          },
        },
      ];

      mockPrismaService.ingestion.findMany.mockResolvedValue(mockIngestions);

      const result = await service.searchProcessedContent(query, userId, limit);

      expect(mockPrismaService.ingestion.findMany).toHaveBeenCalledWith({
        where: {
          userId,
          status: IngestionStatus.COMPLETED,
        },
        include: {
          document: {
            select: {
              id: true,
              title: true,
              description: true,
              tags: true,
            },
          },
        },
        orderBy: {
          completedAt: 'desc',
        },
      });

      expect(result).toHaveLength(1); // Only doc-1 should match
      expect(result[0]).toMatchObject({
        documentId: 'doc-1',
        relevanceScore: expect.any(Number),
        excerpt: expect.any(String),
        matchType: expect.any(String),
      });
      // The excerpt should contain the match or be the title
      expect(
        result[0].excerpt.includes('machine learning') ||
          result[0].excerpt.includes('Machine Learning'),
      ).toBe(true);
      expect(result[0].relevanceScore).toBeGreaterThan(0);
    });

    it('should prioritize title matches over content matches', async () => {
      const query = 'machine learning';
      const userId = 'user-1';

      const mockIngestions = [
        {
          id: 'ingestion-1',
          documentId: 'doc-1',
          userId,
          status: IngestionStatus.COMPLETED,
          logs: {
            processingResult: {
              extractedText: 'This document covers various topics.',
            },
          },
          document: {
            id: 'doc-1',
            title: 'Machine Learning Guide', // Title match
            description: 'Guide',
            tags: [],
          },
        },
        {
          id: 'ingestion-2',
          documentId: 'doc-2',
          userId,
          status: IngestionStatus.COMPLETED,
          logs: {
            processingResult: {
              extractedText:
                'This document covers machine learning algorithms.', // Content match
            },
          },
          document: {
            id: 'doc-2',
            title: 'AI Guide',
            description: 'Guide',
            tags: [],
          },
        },
      ];

      mockPrismaService.ingestion.findMany.mockResolvedValue(mockIngestions);

      const result = await service.searchProcessedContent(query, userId);

      expect(result).toHaveLength(2);

      // Title match should have higher relevance score
      const titleMatch = result.find((r) => r.documentId === 'doc-1');
      const contentMatch = result.find((r) => r.documentId === 'doc-2');

      expect(titleMatch?.relevanceScore).toBeGreaterThan(
        contentMatch?.relevanceScore || 0,
      );
      expect(titleMatch?.matchType).toBe('title');
      expect(contentMatch?.matchType).toBe('content');
    });

    it('should handle keyword matches', async () => {
      const query = 'machine learning';
      const userId = 'user-1';

      const mockIngestions = [
        {
          id: 'ingestion-1',
          documentId: 'doc-1',
          userId,
          status: IngestionStatus.COMPLETED,
          logs: {
            processingResult: {
              extractedText: 'This document covers various topics.',
              keywords: ['machine', 'learning', 'algorithms'], // Keyword match
            },
          },
          document: {
            id: 'doc-1',
            title: 'AI Guide',
            description: 'Guide',
            tags: [],
          },
        },
      ];

      mockPrismaService.ingestion.findMany.mockResolvedValue(mockIngestions);

      const result = await service.searchProcessedContent(query, userId);

      expect(result).toHaveLength(1);
      expect(result[0].matchType).toBe('keywords');
      expect(result[0].excerpt).toContain('machine, learning');
    });

    it('should limit results to specified limit', async () => {
      const query = 'test';
      const userId = 'user-1';
      const limit = 2;

      const mockIngestions = Array.from({ length: 5 }, (_, i) => ({
        id: `ingestion-${i}`,
        documentId: `doc-${i}`,
        userId,
        status: IngestionStatus.COMPLETED,
        logs: {
          processingResult: {
            extractedText: `This is test document ${i}`,
          },
        },
        document: {
          id: `doc-${i}`,
          title: `Test Document ${i}`,
          description: 'Test',
          tags: [],
        },
      }));

      mockPrismaService.ingestion.findMany.mockResolvedValue(mockIngestions);

      const result = await service.searchProcessedContent(query, userId, limit);

      expect(result).toHaveLength(limit);
    });

    it('should return empty array when no matches found', async () => {
      const query = 'nonexistent';
      const userId = 'user-1';

      const mockIngestions = [
        {
          id: 'ingestion-1',
          documentId: 'doc-1',
          userId,
          status: IngestionStatus.COMPLETED,
          logs: {
            processingResult: {
              extractedText: 'This document covers different topics.',
            },
          },
          document: {
            id: 'doc-1',
            title: 'Different Guide',
            description: 'Guide',
            tags: [],
          },
        },
      ];

      mockPrismaService.ingestion.findMany.mockResolvedValue(mockIngestions);

      const result = await service.searchProcessedContent(query, userId);

      expect(result).toHaveLength(0);
    });
  });

  describe('extractRelevantExcerpt', () => {
    it('should extract text around query match', () => {
      const text =
        'This is a long document about machine learning and artificial intelligence. Machine learning is very important.';
      const query = 'machine learning';
      const maxLength = 50;

      const excerpt = (service as any).extractRelevantExcerpt(
        text,
        query,
        maxLength,
      );

      expect(excerpt).toContain('machine learning');
      expect(excerpt.length).toBeLessThanOrEqual(maxLength + 6); // +6 for ellipsis
    });

    it('should return beginning when query not found', () => {
      const text = 'This is a document without the search term.';
      const query = 'nonexistent';
      const maxLength = 20;

      const excerpt = (service as any).extractRelevantExcerpt(
        text,
        query,
        maxLength,
      );

      expect(excerpt).toBe('This is a document w...');
    });

    it('should handle empty text', () => {
      const text = '';
      const query = 'test';
      const maxLength = 50;

      const excerpt = (service as any).extractRelevantExcerpt(
        text,
        query,
        maxLength,
      );

      expect(excerpt).toBe('No content available');
    });
  });
});
