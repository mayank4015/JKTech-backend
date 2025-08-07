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
  CreateIngestionDto,
  IngestionFiltersDto,
  IngestionStatus,
  IngestionSortBy,
} from './dto';

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
}

export interface IngestionStats {
  total: number;
  completed: number;
  processing: number;
  queued: number;
  failed: number;
  averageProcessingTime: number;
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
  ) {}

  async createIngestion(
    createIngestionDto: CreateIngestionDto,
    userId: string,
  ): Promise<Ingestion> {
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
      return ingestion;
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

    // User filter
    if (filters.userId) {
      where.userId = filters.userId;
    }

    // Date range filter
    if (filters.startDate || filters.endDate) {
      where.startedAt = {};
      if (filters.startDate) {
        where.startedAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.startedAt.lte = new Date(filters.endDate);
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

    return {
      ingestions,
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

    return ingestion;
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
        status === IngestionStatus.FAILED) &&
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
    } else if (status === IngestionStatus.FAILED) {
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
      averageProcessingTime: avgProcessingTime,
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
      }
    });

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
}
