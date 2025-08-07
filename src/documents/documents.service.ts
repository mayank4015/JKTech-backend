import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Document, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import { FileUploadService } from '../common/file-upload/file-upload.service';
import {
  serializeDocument,
  serializeDocuments,
} from '../common/utils/bigint-serializer.util';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  DocumentFiltersDto,
  DocumentStatus,
  DocumentSortBy,
} from './dto';

export interface DocumentWithUploader extends Omit<Document, 'fileSize'> {
  fileSize: string;
  uploader: {
    id: string;
    name: string;
    email: string;
  };
}

export interface DocumentStats {
  total: number;
  processed: number;
  pending: number;
  failed: number;
  totalSize: string;
}

export interface PaginatedDocuments {
  documents: DocumentWithUploader[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  stats: DocumentStats;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  async uploadDocument(
    file: Express.Multer.File,
    createDocumentDto: CreateDocumentDto,
    userId: string,
  ): Promise<DocumentWithUploader> {
    this.logger.debug(
      `Uploading document: ${createDocumentDto.title} by user: ${userId}`,
    );

    try {
      // Define allowed file types for documents
      const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
        'image/jpeg',
        'image/png',
        'image/gif',
      ];

      // Upload file to storage
      const uploadResult = await this.fileUploadService.uploadFile(
        file,
        'documents',
        allowedTypes,
      );

      // Create document record in database
      const document = await this.prisma.document.create({
        data: {
          title: createDocumentDto.title,
          description: createDocumentDto.description,
          fileName: uploadResult.fileName,
          fileUrl: uploadResult.url,
          fileType: uploadResult.mimeType,
          fileSize: BigInt(uploadResult.fileSize),
          uploadedBy: userId,
          status: DocumentStatus.PENDING,
          tags: createDocumentDto.tags || [],
          category: createDocumentDto.category,
        },
        include: {
          uploader: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Create initial ingestion record
      await this.prisma.ingestion.create({
        data: {
          documentId: document.id,
          userId,
          status: 'queued',
          progress: 0,
        },
      });

      this.logger.debug(`Document uploaded successfully: ${document.id}`);
      return serializeDocument(document);
    } catch (error) {
      this.logger.error(
        `Failed to upload document: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to upload document: ${error.message}`,
      );
    }
  }

  async getDocuments(
    page: number = 1,
    limit: number = 10,
    filters: DocumentFiltersDto = {},
    userId?: string,
    userRole?: string,
  ): Promise<PaginatedDocuments> {
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Prisma.DocumentWhereInput = {};

    // Search functionality
    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { fileName: { contains: filters.search, mode: 'insensitive' } },
        { tags: { hasSome: [filters.search] } },
      ];
    }

    // Status filter
    if (filters.status) {
      where.status = filters.status;
    }

    // Category filter
    if (filters.category) {
      where.category = filters.category;
    }

    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    // Uploaded by filter
    if (filters.uploadedBy) {
      where.uploadedBy = filters.uploadedBy;
    }

    // Date range filter
    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    // Role-based access control
    if (userRole !== 'admin') {
      where.uploadedBy = userId;
    }

    // Build order by clause
    const orderBy: Prisma.DocumentOrderByWithRelationInput = {};
    if (filters.sortBy) {
      switch (filters.sortBy) {
        case DocumentSortBy.TITLE:
          orderBy.title = filters.sortOrder || 'asc';
          break;
        case DocumentSortBy.CREATED_AT:
          orderBy.createdAt = filters.sortOrder || 'desc';
          break;
        case DocumentSortBy.FILE_SIZE:
          orderBy.fileSize = filters.sortOrder || 'desc';
          break;
        case DocumentSortBy.STATUS:
          orderBy.status = filters.sortOrder || 'asc';
          break;
        default:
          orderBy.createdAt = 'desc';
      }
    } else {
      orderBy.createdAt = 'desc';
    }

    // Execute queries
    const [documents, total, stats] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          uploader: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.document.count({ where }),
      this.getDocumentStats(where),
    ]);

    return {
      documents: serializeDocuments(documents),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      stats,
    };
  }

  async getDocumentById(
    id: string,
    userId?: string,
    userRole?: string,
  ): Promise<DocumentWithUploader> {
    const document = await this.prisma.document.findUnique({
      where: { id },
      include: {
        uploader: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        ingestions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            status: true,
            progress: true,
            startedAt: true,
            completedAt: true,
            error: true,
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Role-based access control
    if (userRole !== 'admin' && document.uploadedBy !== userId) {
      throw new ForbiddenException('Access denied to this document');
    }

    return serializeDocument(document);
  }

  async updateDocument(
    id: string,
    updateDocumentDto: UpdateDocumentDto,
    userId?: string,
    userRole?: string,
  ): Promise<DocumentWithUploader> {
    const existingDocument = await this.prisma.document.findUnique({
      where: { id },
    });

    if (!existingDocument) {
      throw new NotFoundException('Document not found');
    }

    // Role-based access control
    if (userRole !== 'admin' && existingDocument.uploadedBy !== userId) {
      throw new ForbiddenException('Access denied to this document');
    }

    const updatedDocument = await this.prisma.document.update({
      where: { id },
      data: {
        ...updateDocumentDto,
        updatedAt: new Date(),
      },
      include: {
        uploader: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    this.logger.debug(`Document updated: ${id}`);
    return serializeDocument(updatedDocument);
  }

  async deleteDocument(
    id: string,
    userId?: string,
    userRole?: string,
  ): Promise<void> {
    const document = await this.prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Role-based access control
    if (userRole !== 'admin' && document.uploadedBy !== userId) {
      throw new ForbiddenException('Access denied to this document');
    }

    try {
      // Delete file from storage
      const filePath = this.fileUploadService.extractFilePathFromUrl(
        document.fileUrl,
      );
      if (filePath) {
        await this.fileUploadService.deleteFile(filePath);
      }

      // Delete document record (cascades to ingestions)
      await this.prisma.document.delete({
        where: { id },
      });

      this.logger.debug(`Document deleted: ${id}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete document: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to delete document: ${error.message}`,
      );
    }
  }

  async reprocessDocument(
    id: string,
    userId?: string,
    userRole?: string,
  ): Promise<{ document: DocumentWithUploader; ingestionId: string }> {
    const document = await this.prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Role-based access control
    if (userRole !== 'admin' && document.uploadedBy !== userId) {
      throw new ForbiddenException('Access denied to this document');
    }

    try {
      // Update document status to pending
      const updatedDocument = await this.prisma.document.update({
        where: { id },
        data: {
          status: DocumentStatus.PENDING,
          updatedAt: new Date(),
        },
        include: {
          uploader: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Create new ingestion record
      const ingestion = await this.prisma.ingestion.create({
        data: {
          documentId: id,
          userId: userId || document.uploadedBy,
          status: 'queued',
          progress: 0,
        },
      });

      this.logger.debug(`Document queued for reprocessing: ${id}`);
      return {
        document: serializeDocument(updatedDocument),
        ingestionId: ingestion.id,
      };
    } catch (error) {
      this.logger.error(
        `Failed to reprocess document: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to reprocess document: ${error.message}`,
      );
    }
  }

  private async getDocumentStats(
    where: Prisma.DocumentWhereInput,
  ): Promise<DocumentStats> {
    const [totalStats, statusStats] = await Promise.all([
      this.prisma.document.aggregate({
        where,
        _count: { id: true },
        _sum: { fileSize: true },
      }),
      this.prisma.document.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
    ]);

    const stats: DocumentStats = {
      total: totalStats._count.id,
      processed: 0,
      pending: 0,
      failed: 0,
      totalSize: (totalStats._sum.fileSize || BigInt(0)).toString(),
    };

    statusStats.forEach((stat) => {
      switch (stat.status) {
        case DocumentStatus.PROCESSED:
          stats.processed = stat._count.status;
          break;
        case DocumentStatus.PENDING:
          stats.pending = stat._count.status;
          break;
        case DocumentStatus.FAILED:
          stats.failed = stat._count.status;
          break;
      }
    });

    return stats;
  }
}
