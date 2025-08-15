import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { IngestionsService } from '../ingestions/ingestions.service';
import { RAGService } from './services/rag.service';
import { ConversationService } from './services/conversation.service';
import { Prisma } from '@prisma/client';
import {
  AskQuestionDto,
  CreateConversationDto,
  QAFiltersDto,
  SaveQADto,
} from './dto';

@Injectable()
export class QAService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestionsService: IngestionsService,
    private readonly ragService: RAGService,
    private readonly conversationService: ConversationService,
  ) {}

  async askQuestion(userId: string, dto: AskQuestionDto) {
    let conversationId = dto.conversationId;

    // Create new conversation if not provided
    if (!conversationId) {
      const conversation = await this.conversationService.createConversation(
        userId,
        {
          title: this.generateConversationTitle(dto.text),
        },
      );
      conversationId = conversation.id;
    }

    // Create the question
    const question = await this.prisma.question.create({
      data: {
        text: dto.text,
        conversationId,
      },
    });

    // Generate answer using RAG
    const ragResult = await this.ragService.generateAnswer(dto.text, userId);

    // Save the answer
    const answer = await this.prisma.answer.create({
      data: {
        questionId: question.id,
        text: ragResult.answer,
        confidence: ragResult.confidence,
        sources: JSON.parse(
          JSON.stringify(ragResult.sources),
        ) as Prisma.JsonArray,
      },
    });

    // Return the complete Q&A pair
    return {
      question: {
        ...question,
        answer,
      },
      conversationId,
    };
  }

  async createConversation(userId: string, dto: CreateConversationDto) {
    return this.conversationService.createConversation(userId, dto);
  }

  async getConversations(
    userId: string,
    page: number = 1,
    limit: number = 10,
    filters: QAFiltersDto = {},
  ) {
    return this.conversationService.getConversations(
      userId,
      page,
      limit,
      filters,
    );
  }

  async getConversationById(id: string, userId: string) {
    return this.conversationService.getConversationById(id, userId);
  }

  async updateConversation(id: string, userId: string, updates: any) {
    return this.conversationService.updateConversation(id, userId, updates);
  }

  async deleteConversation(id: string, userId: string) {
    return this.conversationService.deleteConversation(id, userId);
  }

  async saveQA(userId: string, dto: SaveQADto) {
    // Check if the question and answer exist
    const question = await this.prisma.question.findUnique({
      where: { id: dto.questionId },
      include: { answer: true },
    });

    if (!question || !question.answer || question.answer.id !== dto.answerId) {
      throw new NotFoundException('Question or answer not found');
    }

    // Check if already saved
    const existingSave = await this.prisma.savedQA.findUnique({
      where: {
        userId_questionId_answerId: {
          userId,
          questionId: dto.questionId,
          answerId: dto.answerId,
        },
      },
    });

    if (existingSave) {
      // Update existing save
      return this.prisma.savedQA.update({
        where: { id: existingSave.id },
        data: {
          notes: dto.notes,
          tags: dto.tags || [],
        },
      });
    }

    // Create new save
    return this.prisma.savedQA.create({
      data: {
        userId,
        questionId: dto.questionId,
        answerId: dto.answerId,
        notes: dto.notes,
        tags: dto.tags || [],
      },
    });
  }

  async getSavedQAs(
    userId: string,
    page: number = 1,
    limit: number = 10,
    filters: QAFiltersDto = {},
  ) {
    const where: any = { userId };

    if (filters.search) {
      where.OR = [
        {
          notes: {
            contains: filters.search,
            mode: 'insensitive',
          },
        },
        {
          tags: {
            hasSome: [filters.search],
          },
        },
      ];
    }

    if (filters.tags && filters.tags.length > 0) {
      where.tags = {
        hasSome: filters.tags,
      };
    }

    if (filters.dateStart && filters.dateEnd) {
      where.createdAt = {
        gte: new Date(filters.dateStart),
        lte: new Date(filters.dateEnd),
      };
    }

    const [savedQAs, total] = await Promise.all([
      this.prisma.savedQA.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.savedQA.count({ where }),
    ]);

    // Fetch question and answer details for each saved QA
    const enrichedSavedQAs = await Promise.all(
      savedQAs.map(async (savedQA) => {
        const question = await this.prisma.question.findUnique({
          where: { id: savedQA.questionId },
          include: {
            answer: true,
            conversation: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        });

        return {
          ...savedQA,
          question,
        };
      }),
    );

    return {
      savedQAs: enrichedSavedQAs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async deleteSavedQA(id: string, userId: string) {
    const savedQA = await this.prisma.savedQA.findUnique({
      where: { id },
    });

    if (!savedQA) {
      throw new NotFoundException('Saved Q&A not found');
    }

    if (savedQA.userId !== userId) {
      throw new NotFoundException('Saved Q&A not found');
    }

    await this.prisma.savedQA.delete({
      where: { id },
    });
  }

  async searchDocuments(userId: string, query: string, limit: number = 10) {
    // Use the enhanced search from IngestionService
    const searchResults = await this.ingestionsService.searchProcessedContent(
      query,
      userId,
      limit,
    );

    // Get document details for each result
    const documentIds = searchResults.map((result) => result.documentId);
    const documents = await this.prisma.document.findMany({
      where: {
        id: { in: documentIds },
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

    // Get processed content for all documents
    const processedContentMap =
      await this.ingestionsService.getProcessedContentBatch(documentIds);

    // Combine search results with document details and processed content
    const enrichedSources = searchResults
      .map((result) => {
        const document = documents.find((doc) => doc.id === result.documentId);
        const processedContent = processedContentMap.get(result.documentId);

        if (!document) return null;

        return {
          documentId: result.documentId,
          title: document.title,
          description: document.description,
          category: document.category,
          tags: document.tags,
          fileType: document.fileType,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
          relevanceScore: result.relevanceScore,
          excerpt: result.excerpt,
          matchType: result.matchType,
          extractedText: processedContent?.extractedText || null,
          summary: processedContent?.summary || null,
          keywords: processedContent?.keywords || [],
          language: processedContent?.language || null,
          ocrText: processedContent?.ocrText || null,
        };
      })
      .filter(Boolean);

    return {
      sources: enrichedSources,
      total: enrichedSources.length,
      query,
    };
  }

  private generateConversationTitle(question: string): string {
    // Generate a title from the first question
    const words = question.split(' ').slice(0, 8);
    let title = words.join(' ');

    if (question.split(' ').length > 8) {
      title += '...';
    }

    return title || 'New Conversation';
  }
}
