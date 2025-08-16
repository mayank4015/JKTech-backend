import { Test, TestingModule } from '@nestjs/testing';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { User } from '@prisma/client';

import { QAController } from './qa.controller';
import { QAService } from './qa.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  AskQuestionDto,
  CreateConversationDto,
  QAFiltersDto,
  SaveQADto,
} from './dto';

describe('QAController', () => {
  let controller: QAController;
  let qaService: DeepMockProxy<QAService>;

  const mockUser: User = {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    role: 'editor',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  };

  const mockRequest = {
    user: {
      id: mockUser.id,
      sub: mockUser.id,
      email: mockUser.email,
      name: mockUser.name,
      role: mockUser.role,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QAController],
      providers: [
        {
          provide: QAService,
          useValue: mockDeep<QAService>(),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<QAController>(QAController);
    qaService = module.get(QAService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('askQuestion', () => {
    it('should ask a question and return the result', async () => {
      const askQuestionDto: AskQuestionDto = {
        text: 'What is machine learning?',
        conversationId: 'conv-id',
      };

      const mockResult = {
        question: {
          id: 'question-id',
          text: askQuestionDto.text,
          conversationId: 'conv-id',
          createdAt: new Date(),
          answer: {
            id: 'answer-id',
            questionId: 'question-id',
            text: 'Machine learning is a subset of AI...',
            confidence: 0.85,
            sources: [],
            createdAt: new Date(),
          },
        },
        conversationId: 'conv-id',
      };

      qaService.askQuestion.mockResolvedValue(mockResult);

      const result = await controller.askQuestion(mockRequest, askQuestionDto);

      expect(qaService.askQuestion).toHaveBeenCalledWith(
        mockUser.id,
        askQuestionDto,
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('createConversation', () => {
    it('should create a new conversation', async () => {
      const createConversationDto: CreateConversationDto = {
        title: 'New Conversation',
      };

      const mockConversation = {
        id: 'conv-id',
        title: createConversationDto.title,
        userId: mockUser.id,
        isBookmarked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        questions: [],
      };

      qaService.createConversation.mockResolvedValue(mockConversation);

      const result = await controller.createConversation(
        mockRequest,
        createConversationDto,
      );

      expect(qaService.createConversation).toHaveBeenCalledWith(
        mockUser.id,
        createConversationDto,
      );
      expect(result).toEqual(mockConversation);
    });
  });

  describe('getConversations', () => {
    it('should get paginated conversations with default parameters', async () => {
      const mockConversations = {
        conversations: [
          {
            id: 'conv-1',
            title: 'Conversation 1',
            userId: mockUser.id,
            isBookmarked: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            questions: [],
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      qaService.getConversations.mockResolvedValue(mockConversations);

      const result = await controller.getConversations(mockRequest, 1, 10, {});

      expect(qaService.getConversations).toHaveBeenCalledWith(
        mockUser.id,
        1,
        10,
        {},
      );
      expect(result).toEqual(mockConversations);
    });

    it('should get conversations with filters', async () => {
      const filters: QAFiltersDto = {
        search: 'machine learning',
        isBookmarked: true,
      };

      const mockConversations = {
        conversations: [],
        pagination: {
          page: 1,
          limit: 10,
          total: 0,
          totalPages: 0,
        },
      };

      qaService.getConversations.mockResolvedValue(mockConversations);

      const result = await controller.getConversations(
        mockRequest,
        1,
        10,
        filters,
      );

      expect(qaService.getConversations).toHaveBeenCalledWith(
        mockUser.id,
        1,
        10,
        filters,
      );
      expect(result).toEqual(mockConversations);
    });
  });

  describe('getConversationById', () => {
    it('should get a conversation by ID', async () => {
      const conversationId = 'conv-id';
      const mockConversation = {
        id: conversationId,
        title: 'Test Conversation',
        userId: mockUser.id,
        isBookmarked: false,
        questions: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      qaService.getConversationById.mockResolvedValue(mockConversation);

      const result = await controller.getConversationById(
        mockRequest,
        conversationId,
      );

      expect(qaService.getConversationById).toHaveBeenCalledWith(
        conversationId,
        mockUser.id,
      );
      expect(result).toEqual(mockConversation);
    });
  });

  describe('updateConversation', () => {
    it('should update a conversation', async () => {
      const conversationId = 'conv-id';
      const updates = { title: 'Updated Title' };
      const mockUpdatedConversation = {
        id: conversationId,
        title: updates.title,
        userId: mockUser.id,
        isBookmarked: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      qaService.updateConversation.mockResolvedValue(mockUpdatedConversation);

      const result = await controller.updateConversation(
        mockRequest,
        conversationId,
        updates,
      );

      expect(qaService.updateConversation).toHaveBeenCalledWith(
        conversationId,
        mockUser.id,
        updates,
      );
      expect(result).toEqual(mockUpdatedConversation);
    });
  });

  describe('deleteConversation', () => {
    it('should delete a conversation', async () => {
      const conversationId = 'conv-id';

      qaService.deleteConversation.mockResolvedValue(undefined);

      const result = await controller.deleteConversation(
        mockRequest,
        conversationId,
      );

      expect(qaService.deleteConversation).toHaveBeenCalledWith(
        conversationId,
        mockUser.id,
      );
      expect(result).toEqual({ message: 'Conversation deleted successfully' });
    });
  });

  describe('saveQA', () => {
    it('should save a Q&A pair', async () => {
      const saveQADto: SaveQADto = {
        questionId: 'question-id',
        answerId: 'answer-id',
        notes: 'Useful information',
        tags: ['ml', 'ai'],
      };

      const mockSavedQA = {
        id: 'saved-qa-id',
        userId: mockUser.id,
        questionId: saveQADto.questionId,
        answerId: saveQADto.answerId,
        notes: saveQADto.notes || null,
        tags: saveQADto.tags || [],
        createdAt: new Date(),
      };

      qaService.saveQA.mockResolvedValue(mockSavedQA);

      const result = await controller.saveQA(mockRequest, saveQADto);

      expect(qaService.saveQA).toHaveBeenCalledWith(mockUser.id, saveQADto);
      expect(result).toEqual(mockSavedQA);
    });
  });

  describe('getSavedQAs', () => {
    it('should get saved Q&As with pagination', async () => {
      const mockSavedQAs = {
        savedQAs: [
          {
            id: 'saved-qa-id',
            userId: mockUser.id,
            questionId: 'question-id',
            answerId: 'answer-id',
            notes: 'Test notes',
            tags: ['test'],
            createdAt: new Date(),
            question: {
              id: 'question-id',
              text: 'Test question',
              conversationId: 'conv-id',
              createdAt: new Date(),
              conversation: {
                id: 'conv-id',
                title: 'Test Conversation',
              },
              answer: {
                id: 'answer-id',
                questionId: 'question-id',
                text: 'Test answer',
                confidence: 0.8,
                sources: null,
                createdAt: new Date(),
              },
            },
            user: {
              id: mockUser.id,
              name: mockUser.name,
              email: mockUser.email,
            },
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          totalPages: 1,
        },
      };

      qaService.getSavedQAs.mockResolvedValue(mockSavedQAs);

      const result = await controller.getSavedQAs(mockRequest, 1, 10, {});

      expect(qaService.getSavedQAs).toHaveBeenCalledWith(
        mockUser.id,
        1,
        10,
        {},
      );
      expect(result).toEqual(mockSavedQAs);
    });
  });

  describe('deleteSavedQA', () => {
    it('should delete a saved Q&A', async () => {
      const savedQAId = 'saved-qa-id';

      qaService.deleteSavedQA.mockResolvedValue(undefined);

      const result = await controller.deleteSavedQA(mockRequest, savedQAId);

      expect(qaService.deleteSavedQA).toHaveBeenCalledWith(
        savedQAId,
        mockUser.id,
      );
      expect(result).toEqual({ message: 'Saved Q&A deleted successfully' });
    });
  });

  describe('searchDocuments', () => {
    it('should search documents with query', async () => {
      const query = 'machine learning';
      const limit = 5;
      const mockSearchResult = {
        sources: [
          {
            documentId: 'doc-1',
            title: 'ML Guide',
            description: 'A comprehensive guide to ML',
            category: 'Education',
            tags: ['ml', 'ai'],
            fileType: 'pdf',
            createdAt: new Date(),
            updatedAt: new Date(),
            relevanceScore: 0.9,
            excerpt: 'Machine learning is...',
            matchType: 'content' as const,
            extractedText: 'Machine learning is a subset of AI...',
            summary: 'This document covers ML basics',
            keywords: ['machine learning', 'AI'],
            language: 'en',
            ocrText: null,
          },
        ],
        total: 1,
        query,
      };

      qaService.searchDocuments.mockResolvedValue(mockSearchResult);

      const result = await controller.searchDocuments(
        mockRequest,
        query,
        limit,
      );

      expect(qaService.searchDocuments).toHaveBeenCalledWith(
        mockUser.id,
        query,
        limit,
      );
      expect(result).toEqual(mockSearchResult);
    });

    it('should return error message when query is empty', async () => {
      const result = await controller.searchDocuments(mockRequest, '', 10);

      expect(result).toEqual({
        sources: [],
        message: 'Query parameter is required',
      });
      expect(qaService.searchDocuments).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should get QA statistics for the user', async () => {
      const mockStats = {
        data: {
          totalQuestions: 25,
          totalAnswers: 23,
          totalConversations: 8,
          averageConfidence: 0.85,
          popularTopics: [],
          recentActivity: [
            { date: '2024-01-15', questionCount: 3 },
            { date: '2024-01-14', questionCount: 2 },
          ],
        },
      };

      qaService.getStats.mockResolvedValue(mockStats);

      const result = await controller.getStats(mockRequest);

      expect(qaService.getStats).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(mockStats);
    });

    it('should handle empty stats', async () => {
      const mockEmptyStats = {
        data: {
          totalQuestions: 0,
          totalAnswers: 0,
          totalConversations: 0,
          averageConfidence: 0,
          popularTopics: [],
          recentActivity: [],
        },
      };

      qaService.getStats.mockResolvedValue(mockEmptyStats);

      const result = await controller.getStats(mockRequest);

      expect(qaService.getStats).toHaveBeenCalledWith(mockUser.id);
      expect(result).toEqual(mockEmptyStats);
    });
  });
});
