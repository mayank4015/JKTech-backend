import { Test, TestingModule } from '@nestjs/testing';
import { QAService } from './qa.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { RAGService } from './services/rag.service';
import { ConversationService } from './services/conversation.service';

describe('QAService', () => {
  let service: QAService;
  let prismaService: PrismaService;
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
      expect(mockRAGService.generateAnswer).toHaveBeenCalledWith(questionText);
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
});
