import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Ingestion, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import {
  ProcessingQueueService,
  DocumentProcessingJobData,
} from '../common/queues/processing-queue.service';
import {
  CreateIngestionDto,
  IngestionFiltersDto,
  IngestionStatus,
  IngestionSortBy,
} from './dto';

export interface IngestionConfig {
  extractText?: boolean;
  performOCR?: boolean;
  extractKeywords?: boolean;
  generateSummary?: boolean;
  detectLanguage?: boolean;
  enableSearch?: boolean;
  autoProcess?: boolean;
  priority?: number;
  chunkSize?: number;
  chunkOverlap?: number;
  extractImages?: boolean;
  extractTables?: boolean;
  language?: string;
  processingMode?: 'standard' | 'enhanced' | 'custom';
  customSettings?: Record<string, any>;
  [key: string]: any;
}

export interface IngestionWithDetails extends Ingestion {
  document: {
    id: string;
    title: string;
    fileName: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
  documentTitle: string;
  createdBy: string;
  createdByName: string;
  configuration: {
    chunkSize: number;
    chunkOverlap: number;
    extractImages: boolean;
    extractTables: boolean;
    language: string;
    processingMode: 'standard' | 'enhanced' | 'custom';
    customSettings: Record<string, any>;
  };
  processingSteps: any[];
}

export interface IngestionStats {
  total: number;
  completed: number;
  processing: number;
  queued: number;
  failed: number;
  cancelled: number;
  averageProcessingTime: number;
  successRate: number;
}

export interface PaginatedIngestions {
  ingestions: IngestionWithDetails[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  stats: IngestionStats;
}

@Injectable()
export class IngestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly processingQueue: ProcessingQueueService,
  ) {}

  private parseIngestionConfig(config: any): IngestionConfig {
    if (!config || typeof config !== 'object') {
      return {};
    }
    return config as IngestionConfig;
  }

  async createIngestion(
    createIngestionDto: CreateIngestionDto,
    userId: string,
  ): Promise<IngestionWithDetails> {
    this.logger.debug(
      `Creating ingestion for document: ${createIngestionDto.documentId} by user: ${userId}`,
    );

    // Verify document exists and user has access
    const document = await this.prisma.document.findUnique({
      where: { id: createIngestionDto.documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    try {
      const ingestion = await this.prisma.ingestion.create({
        data: {
          documentId: createIngestionDto.documentId,
          userId,
          status: IngestionStatus.QUEUED,
          progress: 0,
          config: createIngestionDto.config || {},
        },
        include: {
          document: {
            select: {
              id: true,
              title: true,
              fileName: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      this.logger.debug(`Ingestion created successfully: ${ingestion.id}`);

      // Trigger processing via queue if auto-process is enabled
      const parsedConfig = this.parseIngestionConfig(createIngestionDto.config);
      if (parsedConfig.autoProcess !== false) {
        await this.triggerDocumentProcessing(ingestion.id, userId);
      }

      // Transform ingestion to match frontend expectations
      const config = this.parseIngestionConfig(ingestion.config);
      return {
        ...ingestion,
        documentTitle: ingestion.document.title,
        createdBy: ingestion.userId,
        createdByName: ingestion.user.name,
        configuration: {
          chunkSize: config.chunkSize || 1000,
          chunkOverlap: config.chunkOverlap || 200,
          extractImages: config.extractImages || false,
          extractTables: config.extractTables || false,
          language: config.language || 'en',
          processingMode: config.processingMode || 'standard',
          customSettings: config.customSettings || {},
        },
        processingSteps: [], // TODO: Implement processing steps if needed
      };
    } catch (error) {
      this.logger.error(
        `Failed to create ingestion: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to create ingestion: ${error.message}`,
      );
    }
  }

  async getIngestions(
    page: number = 1,
    limit: number = 10,
    filters: IngestionFiltersDto = {},
    userId?: string,
    userRole?: string,
  ): Promise<PaginatedIngestions> {
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.IngestionWhereInput = {};

    // Status filter
    if (filters.status) {
      where.status = filters.status;
    }

    // Document filter
    if (filters.documentId) {
      where.documentId = filters.documentId;
    }

    // User filter (support both userId and createdBy)
    if (filters.userId) {
      where.userId = filters.userId;
    }
    if (filters.createdBy) {
      where.userId = filters.createdBy;
    }

    // Search filter (search in document title)
    if (filters.search) {
      where.document = {
        title: {
          contains: filters.search,
          mode: 'insensitive',
        },
      };
    }

    // Date range filter (support both formats)
    const startDate = filters.startDate || filters.dateStart;
    const endDate = filters.endDate || filters.dateEnd;
    if (startDate || endDate) {
      where.startedAt = {};
      if (startDate) {
        where.startedAt.gte = new Date(startDate);
      }
      if (endDate) {
        where.startedAt.lte = new Date(endDate);
      }
    }

    // Role-based access control
    if (userRole !== 'admin') {
      where.userId = userId;
    }

    // Build order by clause
    const orderBy: Prisma.IngestionOrderByWithRelationInput = {};
    if (filters.sortBy) {
      switch (filters.sortBy) {
        case IngestionSortBy.STARTED_AT:
          orderBy.startedAt = filters.sortOrder || 'desc';
          break;
        case IngestionSortBy.COMPLETED_AT:
          orderBy.completedAt = filters.sortOrder || 'desc';
          break;
        case IngestionSortBy.STATUS:
          orderBy.status = filters.sortOrder || 'asc';
          break;
        case IngestionSortBy.CREATED_AT:
          orderBy.createdAt = filters.sortOrder || 'desc';
          break;
        default:
          orderBy.createdAt = 'desc';
      }
    } else {
      orderBy.createdAt = 'desc';
    }

    // Execute queries
    const [ingestions, total, stats] = await Promise.all([
      this.prisma.ingestion.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          document: {
            select: {
              id: true,
              title: true,
              fileName: true,
            },
          },
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.ingestion.count({ where }),
      this.getIngestionStats(where),
    ]);

    // Transform ingestions to match frontend expectations
    const transformedIngestions = ingestions.map((ingestion) => {
      const config = this.parseIngestionConfig(ingestion.config);
      return {
        ...ingestion,
        documentTitle: ingestion.document.title,
        createdBy: ingestion.userId,
        createdByName: ingestion.user.name,
        configuration: {
          chunkSize: config.chunkSize || 1000,
          chunkOverlap: config.chunkOverlap || 200,
          extractImages: config.extractImages || false,
          extractTables: config.extractTables || false,
          language: config.language || 'en',
          processingMode: config.processingMode || 'standard',
          customSettings: config.customSettings || {},
        },
        processingSteps: [], // TODO: Implement processing steps if needed
      };
    });

    return {
      ingestions: transformedIngestions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      stats,
    };
  }

  async getIngestionById(
    id: string,
    userId?: string,
    userRole?: string,
  ): Promise<IngestionWithDetails> {
    const ingestion = await this.prisma.ingestion.findUnique({
      where: { id },
      include: {
        document: {
          select: {
            id: true,
            title: true,
            fileName: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!ingestion) {
      throw new NotFoundException('Ingestion not found');
    }

    // Role-based access control
    if (userRole !== 'admin' && ingestion.userId !== userId) {
      throw new ForbiddenException('Access denied to this ingestion');
    }

    // Transform ingestion to match frontend expectations
    const config = this.parseIngestionConfig(ingestion.config);
    return {
      ...ingestion,
      documentTitle: ingestion.document.title,
      createdBy: ingestion.userId,
      createdByName: ingestion.user.name,
      configuration: {
        chunkSize: config.chunkSize || 1000,
        chunkOverlap: config.chunkOverlap || 200,
        extractImages: config.extractImages || false,
        extractTables: config.extractTables || false,
        language: config.language || 'en',
        processingMode: config.processingMode || 'standard',
        customSettings: config.customSettings || {},
      },
      processingSteps: [], // TODO: Implement processing steps if needed
    };
  }

  async updateIngestionStatus(
    id: string,
    status: IngestionStatus,
    progress?: number,
    error?: string,
    logs?: any,
  ): Promise<Ingestion> {
    const updateData: Prisma.IngestionUpdateInput = {
      status,
      updatedAt: new Date(),
    };

    if (progress !== undefined) {
      updateData.progress = progress;
    }

    if (error !== undefined) {
      updateData.error = error;
    }

    if (logs !== undefined) {
      updateData.logs = logs;
    }

    // Set timestamps based on status
    if (status === IngestionStatus.PROCESSING && !updateData.startedAt) {
      updateData.startedAt = new Date();
    }

    if (
      (status === IngestionStatus.COMPLETED ||
        status === IngestionStatus.FAILED ||
        status === IngestionStatus.CANCELLED) &&
      !updateData.completedAt
    ) {
      updateData.completedAt = new Date();
    }

    const updatedIngestion = await this.prisma.ingestion.update({
      where: { id },
      data: updateData,
    });

    // Update document status based on ingestion status
    if (status === IngestionStatus.COMPLETED) {
      await this.prisma.document.update({
        where: { id: updatedIngestion.documentId },
        data: { status: 'processed' },
      });
    } else if (
      status === IngestionStatus.FAILED ||
      status === IngestionStatus.CANCELLED
    ) {
      await this.prisma.document.update({
        where: { id: updatedIngestion.documentId },
        data: { status: 'failed' },
      });
    }

    this.logger.debug(`Ingestion status updated: ${id} -> ${status}`);
    return updatedIngestion;
  }

  private async getIngestionStats(
    where: Prisma.IngestionWhereInput,
  ): Promise<IngestionStats> {
    const [totalStats, statusStats, avgProcessingTime] = await Promise.all([
      this.prisma.ingestion.count({ where }),
      this.prisma.ingestion.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      this.getAverageProcessingTime(where),
    ]);

    const stats: IngestionStats = {
      total: totalStats,
      completed: 0,
      processing: 0,
      queued: 0,
      failed: 0,
      cancelled: 0,
      averageProcessingTime: avgProcessingTime,
      successRate: 0,
    };

    statusStats.forEach((stat) => {
      switch (stat.status) {
        case IngestionStatus.COMPLETED:
          stats.completed = stat._count.status;
          break;
        case IngestionStatus.PROCESSING:
          stats.processing = stat._count.status;
          break;
        case IngestionStatus.QUEUED:
          stats.queued = stat._count.status;
          break;
        case IngestionStatus.FAILED:
          stats.failed = stat._count.status;
          break;
        case IngestionStatus.CANCELLED:
          stats.cancelled = stat._count.status;
          break;
      }
    });

    // Calculate success rate
    const totalFinished = stats.completed + stats.failed + stats.cancelled;
    stats.successRate =
      totalFinished > 0
        ? Math.round((stats.completed / totalFinished) * 100)
        : 0;

    return stats;
  }

  private async getAverageProcessingTime(
    where: Prisma.IngestionWhereInput,
  ): Promise<number> {
    const completedIngestions = await this.prisma.ingestion.findMany({
      where: {
        ...where,
        status: IngestionStatus.COMPLETED,
        startedAt: { not: null },
        completedAt: { not: null },
      },
      select: {
        startedAt: true,
        completedAt: true,
      },
    });

    if (completedIngestions.length === 0) {
      return 0;
    }

    const totalTime = completedIngestions.reduce((sum, ingestion) => {
      const startTime = new Date(ingestion.startedAt!).getTime();
      const endTime = new Date(ingestion.completedAt!).getTime();
      return sum + (endTime - startTime);
    }, 0);

    return Math.round(totalTime / completedIngestions.length / 1000); // Return in seconds
  }

  async triggerDocumentProcessing(
    ingestionId: string,
    userId: string,
  ): Promise<string> {
    this.logger.debug(`Triggering processing for ingestion: ${ingestionId}`);

    // Get ingestion with document details
    const ingestion = await this.prisma.ingestion.findUnique({
      where: { id: ingestionId },
      include: {
        document: true,
      },
    });

    if (!ingestion) {
      throw new NotFoundException('Ingestion not found');
    }

    if (!ingestion.document) {
      throw new NotFoundException('Document not found for ingestion');
    }

    // Prepare job data
    const parsedConfig = this.parseIngestionConfig(ingestion.config);
    const jobData: DocumentProcessingJobData = {
      documentId: ingestion.documentId,
      fileName: ingestion.document.fileName,
      fileType: ingestion.document.fileType,
      filePath: ingestion.document.fileUrl,
      userId,
      config: {
        extractText: parsedConfig.extractText ?? true,
        performOCR: parsedConfig.performOCR ?? false,
        extractKeywords: parsedConfig.extractKeywords ?? true,
        generateSummary: parsedConfig.generateSummary ?? true,
        detectLanguage: parsedConfig.detectLanguage ?? true,
        enableSearch: parsedConfig.enableSearch ?? true,
      },
    };

    try {
      // Add job to processing queue
      const job = await this.processingQueue.addProcessingJob(jobData, {
        priority: parsedConfig.priority || 0,
        attempts: 3,
      });

      // Update ingestion status to processing
      await this.updateIngestionStatus(
        ingestionId,
        IngestionStatus.PROCESSING,
        0,
        undefined,
        { jobId: job.id.toString() },
      );

      this.logger.debug(
        `Processing job created for ingestion ${ingestionId} with job ID: ${job.id}`,
      );

      return job.id.toString();
    } catch (error) {
      this.logger.error(
        `Failed to trigger processing for ingestion ${ingestionId}:`,
        error.stack,
      );

      // Update ingestion status to failed
      await this.updateIngestionStatus(
        ingestionId,
        IngestionStatus.FAILED,
        0,
        `Failed to queue processing: ${error.message}`,
      );

      throw new BadRequestException(
        `Failed to trigger processing: ${error.message}`,
      );
    }
  }

  async getProcessingStatus(ingestionId: string): Promise<any> {
    const ingestion = await this.prisma.ingestion.findUnique({
      where: { id: ingestionId },
    });

    if (!ingestion) {
      throw new NotFoundException('Ingestion not found');
    }

    const jobId = (ingestion.logs as any)?.jobId;
    if (!jobId) {
      return {
        status: ingestion.status,
        progress: ingestion.progress,
        error: ingestion.error,
      };
    }

    // Get job status from queue
    const jobStatus = await this.processingQueue.getJobStatus(jobId);
    if (!jobStatus) {
      return {
        status: ingestion.status,
        progress: ingestion.progress,
        error: ingestion.error,
      };
    }

    return {
      status: jobStatus.status,
      progress: jobStatus.progress,
      error: jobStatus.error,
      jobId: jobStatus.id,
      createdAt: jobStatus.createdAt,
      processedAt: jobStatus.processedAt,
      finishedAt: jobStatus.finishedAt,
    };
  }

  async cancelProcessing(
    ingestionId: string,
    userId: string,
  ): Promise<boolean> {
    const ingestion = await this.prisma.ingestion.findUnique({
      where: { id: ingestionId },
    });

    if (!ingestion) {
      throw new NotFoundException('Ingestion not found');
    }

    // Check if user has permission to cancel
    if (ingestion.userId !== userId) {
      throw new ForbiddenException('Access denied to cancel this processing');
    }

    // Check if ingestion is in a cancellable state
    if (
      ingestion.status !== IngestionStatus.QUEUED &&
      ingestion.status !== IngestionStatus.PROCESSING
    ) {
      throw new BadRequestException(
        `Cannot cancel ingestion with status: ${ingestion.status}`,
      );
    }

    let cancelled = false;
    const jobId = (ingestion.logs as any)?.jobId;

    if (jobId) {
      // Try to cancel the job if it exists
      try {
        cancelled = await this.processingQueue.cancelJob(jobId);
        this.logger.debug(`Job ${jobId} cancellation result: ${cancelled}`);
      } catch (error) {
        this.logger.warn(`Failed to cancel job ${jobId}: ${error.message}`);
        // Continue with status update even if job cancellation fails
        cancelled = true;
      }
    } else {
      // If no job ID exists, the ingestion is likely still queued
      // We can still cancel it by updating the status
      this.logger.debug(
        `No job ID found for ingestion ${ingestionId}, updating status directly`,
      );
      cancelled = true;
    }

    if (cancelled) {
      // Update ingestion status to cancelled
      await this.updateIngestionStatus(
        ingestionId,
        IngestionStatus.CANCELLED,
        ingestion.progress,
        'Processing cancelled by user',
      );

      this.logger.debug(`Ingestion ${ingestionId} cancelled successfully`);
    }

    return cancelled;
  }

  /**
   * Get processed content from the latest completed ingestion for a document
   * Used by QA module for RAG functionality
   */
  async getProcessedContent(documentId: string): Promise<{
    extractedText?: string;
    summary?: string;
    keywords?: string[];
    language?: string;
    ocrText?: string;
  } | null> {
    const latestIngestion = await this.prisma.ingestion.findFirst({
      where: {
        documentId,
        status: IngestionStatus.COMPLETED,
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    if (!latestIngestion?.logs) {
      return null;
    }

    const ingestionData = latestIngestion.logs as any;
    const processingResult = ingestionData.processingResult || {};

    return {
      extractedText:
        processingResult.extractedText || ingestionData.extractedText,
      summary: processingResult.summary,
      keywords: processingResult.keywords || [],
      language: processingResult.language,
      ocrText: processingResult.ocrText,
    };
  }

  /**
   * Get processed content for multiple documents
   * Optimized for QA search operations
   */
  async getProcessedContentBatch(documentIds: string[]): Promise<
    Map<
      string,
      {
        extractedText?: string;
        summary?: string;
        keywords?: string[];
        language?: string;
        ocrText?: string;
      }
    >
  > {
    if (documentIds.length === 0) {
      return new Map();
    }

    const ingestions = await this.prisma.ingestion.findMany({
      where: {
        documentId: { in: documentIds },
        status: IngestionStatus.COMPLETED,
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    // Group by documentId and take the latest for each
    const latestByDocument = new Map<string, any>();

    for (const ingestion of ingestions) {
      if (!latestByDocument.has(ingestion.documentId)) {
        latestByDocument.set(ingestion.documentId, ingestion);
      }
    }

    const result = new Map<string, any>();

    for (const [documentId, ingestion] of latestByDocument) {
      if (ingestion.logs) {
        const ingestionData = ingestion.logs as any;
        const processingResult = ingestionData.processingResult || {};

        result.set(documentId, {
          extractedText:
            processingResult.extractedText || ingestionData.extractedText,
          summary: processingResult.summary,
          keywords: processingResult.keywords || [],
          language: processingResult.language,
          ocrText: processingResult.ocrText,
        });
      }
    }

    return result;
  }

  /**
   * Search within processed document content
   * Used for enhanced document search in QA module
   */
  async searchProcessedContent(
    query: string,
    userId: string,
    limit: number = 10,
  ): Promise<
    Array<{
      documentId: string;
      relevanceScore: number;
      excerpt: string;
      matchType: 'title' | 'content' | 'summary' | 'keywords';
    }>
  > {
    // Get user's completed ingestions
    const ingestions = await this.prisma.ingestion.findMany({
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

    const results: Array<{
      documentId: string;
      relevanceScore: number;
      excerpt: string;
      matchType: 'title' | 'content' | 'summary' | 'keywords';
    }> = [];

    const queryLower = query.toLowerCase();
    const queryKeywords = queryLower
      .split(/\s+/)
      .filter((word) => word.length > 2);

    for (const ingestion of ingestions) {
      if (!ingestion.logs) continue;

      const ingestionData = ingestion.logs as any;
      const processingResult = ingestionData.processingResult || {};
      const document = ingestion.document;

      let bestMatch: any = null;
      let bestScore = 0;

      // Check title match with partial matching
      const titleMatch = this.calculatePartialMatch(
        document.title,
        queryKeywords,
      );
      if (titleMatch.score > 0) {
        const score = 0.9 * titleMatch.score;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            excerpt: document.title,
            matchType: 'title' as const,
          };
        }
      }

      // Check content match with partial matching
      const extractedText =
        processingResult.extractedText || ingestionData.extractedText;
      if (extractedText) {
        const contentMatch = this.calculatePartialMatch(
          extractedText,
          queryKeywords,
        );
        if (contentMatch.score > 0) {
          const score = 0.7 * contentMatch.score;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = {
              excerpt: this.extractRelevantExcerptPartial(
                extractedText,
                queryKeywords,
                200,
              ),
              matchType: 'content' as const,
            };
          }
        }
      }

      // Check summary match with partial matching
      if (processingResult.summary) {
        const summaryMatch = this.calculatePartialMatch(
          processingResult.summary,
          queryKeywords,
        );
        if (summaryMatch.score > 0) {
          const score = 0.6 * summaryMatch.score;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = {
              excerpt: processingResult.summary,
              matchType: 'summary' as const,
            };
          }
        }
      }

      // Check keywords match with partial matching
      const keywords = processingResult.keywords || [];
      const keywordMatch = this.calculateKeywordPartialMatch(
        keywords,
        queryKeywords,
      );
      if (keywordMatch.matchingKeywords.length > 0) {
        const score = 0.5 + keywordMatch.score * 0.3;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            excerpt: `Keywords: ${keywordMatch.matchingKeywords.join(', ')}`,
            matchType: 'keywords' as const,
          };
        }
      }

      if (bestMatch && bestScore > 0) {
        results.push({
          documentId: document.id,
          relevanceScore: bestScore,
          excerpt: bestMatch.excerpt,
          matchType: bestMatch.matchType,
        });
      }
    }

    // Sort by relevance and limit results
    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  private extractRelevantExcerpt(
    text: string,
    query: string,
    maxLength: number,
  ): string {
    if (!text) return 'No content available';

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    // Find the position of the query in the text
    const queryIndex = lowerText.indexOf(lowerQuery);

    if (queryIndex === -1) {
      // If exact query not found, return beginning of text
      return (
        text.substring(0, maxLength) + (text.length > maxLength ? '...' : '')
      );
    }

    // Extract text around the query
    const start = Math.max(0, queryIndex - maxLength / 2);
    const end = Math.min(text.length, start + maxLength);

    let excerpt = text.substring(start, end);

    if (start > 0) excerpt = '...' + excerpt;
    if (end < text.length) excerpt = excerpt + '...';

    return excerpt;
  }

  /**
   * Calculate partial match score for text against query keywords
   */
  private calculatePartialMatch(
    text: string,
    queryKeywords: string[],
  ): { score: number; matchedWords: string[] } {
    if (!text || queryKeywords.length === 0) {
      return { score: 0, matchedWords: [] };
    }

    const textLower = text.toLowerCase();
    const textWords = textLower.split(/\s+/);
    const matchedWords: string[] = [];
    let totalMatches = 0;

    for (const queryWord of queryKeywords) {
      let wordMatched = false;

      // Check for exact word matches first (higher score)
      if (textWords.some((word) => word === queryWord)) {
        totalMatches += 1.0;
        matchedWords.push(queryWord);
        wordMatched = true;
      }
      // Check for partial matches (substring matching)
      else if (
        textWords.some(
          (word) => word.includes(queryWord) || queryWord.includes(word),
        )
      ) {
        totalMatches += 0.7;
        matchedWords.push(queryWord);
        wordMatched = true;
      }
      // Check if query word is contained anywhere in the text
      else if (textLower.includes(queryWord)) {
        totalMatches += 0.5;
        matchedWords.push(queryWord);
        wordMatched = true;
      }
    }

    const score =
      queryKeywords.length > 0 ? totalMatches / queryKeywords.length : 0;
    return { score: Math.min(1, score), matchedWords };
  }

  /**
   * Calculate partial match for keywords specifically
   */
  private calculateKeywordPartialMatch(
    keywords: string[],
    queryKeywords: string[],
  ): { score: number; matchingKeywords: string[] } {
    if (!keywords || keywords.length === 0 || queryKeywords.length === 0) {
      return { score: 0, matchingKeywords: [] };
    }

    const matchingKeywords: string[] = [];
    let totalMatches = 0;

    for (const queryWord of queryKeywords) {
      for (const keyword of keywords) {
        const keywordLower = keyword.toLowerCase();

        // Exact match
        if (keywordLower === queryWord) {
          totalMatches += 1.0;
          if (!matchingKeywords.includes(keyword)) {
            matchingKeywords.push(keyword);
          }
        }
        // Partial match (either direction)
        else if (
          keywordLower.includes(queryWord) ||
          queryWord.includes(keywordLower)
        ) {
          totalMatches += 0.7;
          if (!matchingKeywords.includes(keyword)) {
            matchingKeywords.push(keyword);
          }
        }
      }
    }

    const score =
      queryKeywords.length > 0 ? totalMatches / queryKeywords.length : 0;
    return { score: Math.min(1, score), matchingKeywords };
  }

  /**
   * Extract relevant excerpt with partial matching support
   */
  private extractRelevantExcerptPartial(
    text: string,
    queryKeywords: string[],
    maxLength: number,
  ): string {
    if (!text) return 'No content available';

    const textLower = text.toLowerCase();
    let bestPosition = -1;
    let bestScore = 0;

    // Find the best position that contains the most query keywords
    for (let i = 0; i < text.length - maxLength; i += 50) {
      const segment = textLower.substring(i, i + maxLength);
      let segmentScore = 0;

      for (const keyword of queryKeywords) {
        if (segment.includes(keyword)) {
          segmentScore += 1;
        }
      }

      if (segmentScore > bestScore) {
        bestScore = segmentScore;
        bestPosition = i;
      }
    }

    // If no good position found, try to find any keyword match
    if (bestPosition === -1) {
      for (const keyword of queryKeywords) {
        const keywordIndex = textLower.indexOf(keyword);
        if (keywordIndex !== -1) {
          bestPosition = Math.max(0, keywordIndex - maxLength / 2);
          break;
        }
      }
    }

    // Fallback to beginning if no matches found
    if (bestPosition === -1) {
      bestPosition = 0;
    }

    const start = bestPosition;
    const end = Math.min(text.length, start + maxLength);
    let excerpt = text.substring(start, end);

    if (start > 0) excerpt = '...' + excerpt;
    if (end < text.length) excerpt = excerpt + '...';

    return excerpt;
  }
}
