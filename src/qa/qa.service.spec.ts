import { Test, TestingModule } from '@nestjs/testing';
import { QAService } from './qa.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { IngestionsService } from '../ingestions/ingestions.service';
import { RAGService } from './services/rag.service';
import { ConversationService } from './services/conversation.service';

describe('QAService', () => {
  let service: QAService;
  let prismaService: PrismaService;
  let ingestionsService: IngestionsService;
  let ragService: RAGService;
  let conversationService: ConversationService;

  const mockPrismaService = {
    question: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    answer: {
      create: jest.fn(),
    },
    savedQA: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    document: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const mockIngestionsService = {
    searchProcessedContent: jest.fn(),
    getProcessedContent: jest.fn(),
    getProcessedContentBatch: jest.fn(),
  };

  const mockRAGService = {
    generateAnswer: jest.fn(),
  };

  const mockConversationService = {
    createConversation: jest.fn(),
    getConversations: jest.fn(),
    getConversationById: jest.fn(),
    updateConversation: jest.fn(),
    deleteConversation: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QAService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: IngestionsService,
          useValue: mockIngestionsService,
        },
        {
          provide: RAGService,
          useValue: mockRAGService,
        },
        {
          provide: ConversationService,
          useValue: mockConversationService,
        },
      ],
    }).compile();

    service = module.get<QAService>(QAService);
    prismaService = module.get<PrismaService>(PrismaService);
    ingestionsService = module.get<IngestionsService>(IngestionsService);
    ragService = module.get<RAGService>(RAGService);
    conversationService = module.get<ConversationService>(ConversationService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('askQuestion', () => {
    it('should create a new conversation and answer a question', async () => {
      const userId = 'test-user-id';
      const questionText = 'What is machine learning?';
      const mockConversation = {
        id: 'conv-id',
        title: 'What is machine learning?',
      };
      const mockQuestion = {
        id: 'question-id',
        text: questionText,
        conversationId: 'conv-id',
      };
      const mockRAGResult = {
        answer: 'Machine learning is a subset of AI...',
        confidence: 0.85,
        sources: [
          {
            documentId: 'doc-1',
            documentTitle: 'ML Guide',
            excerpt: 'Machine learning is...',
            relevanceScore: 0.9,
          },
        ],
      };
      const mockAnswer = {
        id: 'answer-id',
        questionId: 'question-id',
        text: mockRAGResult.answer,
        confidence: mockRAGResult.confidence,
        sources: mockRAGResult.sources,
      };

      mockConversationService.createConversation.mockResolvedValue(
        mockConversation,
      );
      mockPrismaService.question.create.mockResolvedValue(mockQuestion);
      mockRAGService.generateAnswer.mockResolvedValue(mockRAGResult);
      mockPrismaService.answer.create.mockResolvedValue(mockAnswer);

      const result = await service.askQuestion(userId, { text: questionText });

      expect(mockConversationService.createConversation).toHaveBeenCalledWith(
        userId,
        {
          title: 'What is machine learning?',
        },
      );
      expect(mockPrismaService.question.create).toHaveBeenCalledWith({
        data: {
          text: questionText,
          conversationId: 'conv-id',
        },
      });
      expect(mockRAGService.generateAnswer).toHaveBeenCalledWith(
        questionText,
        userId,
      );
      expect(mockPrismaService.answer.create).toHaveBeenCalled();
      expect(result.conversationId).toBe('conv-id');
      expect(result.question.answer).toBeDefined();
    });

    it('should use existing conversation when conversationId is provided', async () => {
      const userId = 'test-user-id';
      const conversationId = 'existing-conv-id';
      const questionText = 'Follow-up question';
      const mockQuestion = {
        id: 'question-id',
        text: questionText,
        conversationId,
      };
      const mockRAGResult = {
        answer: 'This is a follow-up answer...',
        confidence: 0.75,
        sources: [],
      };
      const mockAnswer = {
        id: 'answer-id',
        questionId: 'question-id',
        text: mockRAGResult.answer,
        confidence: mockRAGResult.confidence,
        sources: mockRAGResult.sources,
      };

      mockPrismaService.question.create.mockResolvedValue(mockQuestion);
      mockRAGService.generateAnswer.mockResolvedValue(mockRAGResult);
      mockPrismaService.answer.create.mockResolvedValue(mockAnswer);

      const result = await service.askQuestion(userId, {
        text: questionText,
        conversationId,
      });

      expect(mockConversationService.createConversation).not.toHaveBeenCalled();
      expect(result.conversationId).toBe(conversationId);
    });
  });

  describe('saveQA', () => {
    it('should save a Q&A pair', async () => {
      const userId = 'test-user-id';
      const saveQADto = {
        questionId: 'question-id',
        answerId: 'answer-id',
        notes: 'Useful information',
        tags: ['ml', 'ai'],
      };
      const mockQuestion = {
        id: 'question-id',
        answer: { id: 'answer-id' },
      };
      const mockSavedQA = {
        id: 'saved-qa-id',
        ...saveQADto,
        userId,
      };

      mockPrismaService.question.findUnique.mockResolvedValue(mockQuestion);
      mockPrismaService.savedQA.findUnique.mockResolvedValue(null);
      mockPrismaService.savedQA.create.mockResolvedValue(mockSavedQA);

      const result = await service.saveQA(userId, saveQADto);

      expect(mockPrismaService.savedQA.create).toHaveBeenCalledWith({
        data: {
          userId,
          questionId: saveQADto.questionId,
          answerId: saveQADto.answerId,
          notes: saveQADto.notes,
          tags: saveQADto.tags,
        },
      });
      expect(result).toEqual(mockSavedQA);
    });
  });

  describe('searchDocuments', () => {
    it('should search documents using IngestionService and return enriched results', async () => {
      const userId = 'test-user-id';
      const query = 'machine learning';
      const limit = 5;

      const mockSearchResults = [
        {
          documentId: 'doc-1',
          relevanceScore: 0.9,
          excerpt: 'Machine learning is a subset of AI...',
          matchType: 'content' as const,
        },
        {
          documentId: 'doc-2',
          relevanceScore: 0.7,
          excerpt: 'ML Guide',
          matchType: 'title' as const,
        },
      ];

      const mockDocuments = [
        {
          id: 'doc-1',
          title: 'Introduction to ML',
          description: 'A comprehensive guide',
          category: 'Education',
          tags: ['ml', 'ai'],
          fileType: 'pdf',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'doc-2',
          title: 'ML Guide',
          description: 'Quick reference',
          category: 'Reference',
          tags: ['ml'],
          fileType: 'docx',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockProcessedContentMap = new Map([
        [
          'doc-1',
          {
            extractedText:
              'Machine learning is a subset of artificial intelligence...',
            summary: 'This document covers ML basics',
            keywords: ['machine learning', 'AI', 'algorithms'],
            language: 'en',
            ocrText: null,
          },
        ],
        [
          'doc-2',
          {
            extractedText: 'Quick guide to machine learning concepts...',
            summary: 'Reference guide for ML',
            keywords: ['ML', 'guide', 'reference'],
            language: 'en',
            ocrText: null,
          },
        ],
      ]);

      mockIngestionsService.searchProcessedContent.mockResolvedValue(
        mockSearchResults,
      );
      mockPrismaService.document.findMany.mockResolvedValue(mockDocuments);
      mockIngestionsService.getProcessedContentBatch.mockResolvedValue(
        mockProcessedContentMap,
      );

      const result = await service.searchDocuments(userId, query, limit);

      expect(mockIngestionsService.searchProcessedContent).toHaveBeenCalledWith(
        query,
        userId,
        limit,
      );
      expect(mockPrismaService.document.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['doc-1', 'doc-2'] },
          uploadedBy: userId,
        },
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          tags: true,
          fileType: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      expect(
        mockIngestionsService.getProcessedContentBatch,
      ).toHaveBeenCalledWith(['doc-1', 'doc-2']);

      expect(result.sources).toHaveLength(2);
      expect(result.sources[0]).toMatchObject({
        documentId: 'doc-1',
        title: 'Introduction to ML',
        relevanceScore: 0.9,
        excerpt: 'Machine learning is a subset of AI...',
        matchType: 'content',
        extractedText:
          'Machine learning is a subset of artificial intelligence...',
        summary: 'This document covers ML basics',
        keywords: ['machine learning', 'AI', 'algorithms'],
      });
      expect(result.total).toBe(2);
      expect(result.query).toBe(query);
    });

    it('should handle empty search results', async () => {
      const userId = 'test-user-id';
      const query = 'nonexistent topic';
      const limit = 5;

      mockIngestionsService.searchProcessedContent.mockResolvedValue([]);
      mockPrismaService.document.findMany.mockResolvedValue([]);
      mockIngestionsService.getProcessedContentBatch.mockResolvedValue(
        new Map(),
      );

      const result = await service.searchDocuments(userId, query, limit);

      expect(result.sources).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.query).toBe(query);
    });

    it('should filter out documents that are not found in database', async () => {
      const userId = 'test-user-id';
      const query = 'test query';

      const mockSearchResults = [
        {
          documentId: 'doc-1',
          relevanceScore: 0.9,
          excerpt: 'Test content',
          matchType: 'content' as const,
        },
        {
          documentId: 'doc-2', // This document won't be found in database
          relevanceScore: 0.8,
          excerpt: 'Another test',
          matchType: 'content' as const,
        },
      ];

      const mockDocuments = [
        {
          id: 'doc-1',
          title: 'Test Document',
          description: 'Test description',
          category: 'Test',
          tags: ['test'],
          fileType: 'pdf',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        // doc-2 is missing from database results
      ];

      const mockProcessedContentMap = new Map([
        ['doc-1', { extractedText: 'Test content', keywords: ['test'] }],
      ]);

      mockIngestionsService.searchProcessedContent.mockResolvedValue(
        mockSearchResults,
      );
      mockPrismaService.document.findMany.mockResolvedValue(mockDocuments);
      mockIngestionsService.getProcessedContentBatch.mockResolvedValue(
        mockProcessedContentMap,
      );

      const result = await service.searchDocuments(userId, query);

      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]?.documentId).toBe('doc-1');
    });
  });
});
