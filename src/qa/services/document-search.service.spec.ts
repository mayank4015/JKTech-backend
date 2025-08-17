import { Test, TestingModule } from '@nestjs/testing';
import { DocumentSearchService } from './document-search.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IngestionsService } from '../../ingestions/ingestions.service';

describe('DocumentSearchService', () => {
  let service: DocumentSearchService;
  let prismaService: PrismaService;
  let ingestionsService: IngestionsService;

  const mockPrismaService = {
    document: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockIngestionsService = {
    searchProcessedContent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentSearchService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: IngestionsService,
          useValue: mockIngestionsService,
        },
      ],
    }).compile();

    service = module.get<DocumentSearchService>(DocumentSearchService);
    prismaService = module.get<PrismaService>(PrismaService);
    ingestionsService = module.get<IngestionsService>(IngestionsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchDocuments', () => {
    it('should use IngestionService when userId is provided', async () => {
      const query = 'machine learning';
      const limit = 5;
      const userId = 'test-user-id';

      const mockSearchResults = [
        {
          documentId: 'doc-1',
          relevanceScore: 0.9,
          excerpt: 'Machine learning is a subset of AI...',
          matchType: 'content',
        },
      ];

      const mockDocument = {
        id: 'doc-1',
        title: 'ML Guide',
        category: 'Education',
      };

      mockIngestionsService.searchProcessedContent.mockResolvedValue(
        mockSearchResults,
      );
      mockPrismaService.document.findUnique.mockResolvedValue(mockDocument);

      const result = await service.searchDocuments(query, limit, userId);

      expect(mockIngestionsService.searchProcessedContent).toHaveBeenCalledWith(
        query,
        userId,
        'viewer',
        limit,
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        documentId: 'doc-1',
        documentTitle: 'ML Guide',
        excerpt: 'Machine learning is a subset of AI...',
        relevanceScore: 0.9,
        context: 'Education (content)',
      });
    });

    it('should use basic search when userId is not provided', async () => {
      const query = 'machine learning';
      const limit = 5;

      const mockDocuments = [
        {
          id: 'doc-1',
          title: 'ML Guide',
          description: 'A guide to machine learning',
          category: 'Education',
          tags: ['ml', 'ai'],
          updatedAt: new Date(),
          ingestions: [
            {
              logs: {
                processingResult: {
                  extractedText:
                    'Machine learning is a subset of artificial intelligence...',
                },
              },
            },
          ],
        },
      ];

      mockPrismaService.document.findMany.mockResolvedValue(mockDocuments);

      const result = await service.searchDocuments(query, limit);

      expect(mockPrismaService.document.findMany).toHaveBeenCalledWith({
        where: {
          status: 'processed',
        },
        include: {
          ingestions: {
            where: {
              status: 'completed',
            },
            orderBy: {
              completedAt: 'desc',
            },
            take: 1,
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        documentId: 'doc-1',
        documentTitle: 'ML Guide',
        context: 'Education',
      });
    });

    it('should handle documents without ingestion data', async () => {
      const query = 'test';
      const limit = 5;

      const mockDocuments = [
        {
          id: 'doc-1',
          title: 'Test Document',
          description: 'A test document',
          category: 'Test',
          tags: [],
          updatedAt: new Date(),
          ingestions: [], // No ingestions
        },
      ];

      mockPrismaService.document.findMany.mockResolvedValue(mockDocuments);

      const result = await service.searchDocuments(query, limit);

      expect(result).toHaveLength(0);
    });

    it('should handle search errors gracefully', async () => {
      const query = 'test';
      const limit = 5;
      const userId = 'test-user-id';

      mockIngestionsService.searchProcessedContent.mockRejectedValue(
        new Error('Search failed'),
      );

      const result = await service.searchDocuments(query, limit, userId);

      expect(result).toHaveLength(0);
    });
  });

  describe('extractKeywords', () => {
    it('should extract keywords from query', () => {
      const query = 'machine learning artificial intelligence';
      const keywords = (service as any).extractKeywords(query);

      expect(keywords).toEqual([
        'machine',
        'learning',
        'artificial',
        'intelligence',
      ]);
    });

    it('should filter out short words', () => {
      const query = 'ml is ai';
      const keywords = (service as any).extractKeywords(query);

      expect(keywords).toEqual([]);
    });

    it('should limit keywords to 10', () => {
      const query =
        'one two three four five six seven eight nine ten eleven twelve';
      const keywords = (service as any).extractKeywords(query);

      expect(keywords).toHaveLength(10);
    });
  });

  describe('extractRelevantExcerpt', () => {
    it('should extract text around query match', () => {
      const text =
        'This is a long text about machine learning and artificial intelligence. Machine learning is very important in modern technology.';
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

    it('should return beginning of text when query not found', () => {
      const text = 'This is a text without the search term.';
      const query = 'nonexistent';
      const maxLength = 20;

      const excerpt = (service as any).extractRelevantExcerpt(
        text,
        query,
        maxLength,
      );

      expect(excerpt).toBe('This is a text witho...');
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

  describe('calculateRelevanceScore', () => {
    it('should calculate relevance score based on multiple factors', () => {
      const document = {
        title: 'Machine Learning Guide',
        description: 'A comprehensive guide to machine learning',
        tags: ['ml', 'ai', 'machine'],
        updatedAt: new Date(),
        ingestions: [
          {
            logs: {
              processingResult: {
                keywords: ['machine', 'learning', 'artificial'],
              },
            },
          },
        ],
      };
      const query = 'machine learning';
      const keywords = ['machine', 'learning'];

      const score = (service as any).calculateRelevanceScore(
        document,
        query,
        keywords,
      );

      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should give higher score for title matches', () => {
      const baseDate = new Date('2023-01-01');
      const documentWithTitleMatch = {
        title: 'Machine Learning Guide',
        description: 'A guide',
        tags: [],
        updatedAt: baseDate,
        ingestions: [],
      };
      const documentWithoutTitleMatch = {
        title: 'AI Guide',
        description: 'A guide about machine learning',
        tags: [],
        updatedAt: baseDate, // Same date to eliminate recency bias
        ingestions: [],
      };
      const query = 'machine learning';
      const keywords = ['machine', 'learning'];

      const scoreWithTitle = (service as any).calculateRelevanceScore(
        documentWithTitleMatch,
        query,
        keywords,
      );
      const scoreWithoutTitle = (service as any).calculateRelevanceScore(
        documentWithoutTitleMatch,
        query,
        keywords,
      );

      // Both should have some score, but title match should be higher
      expect(scoreWithTitle).toBeGreaterThan(0);
      expect(scoreWithoutTitle).toBeGreaterThan(0);
      expect(scoreWithTitle).toBeGreaterThan(scoreWithoutTitle);
    });
  });
});
