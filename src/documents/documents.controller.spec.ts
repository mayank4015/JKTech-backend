import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { User } from '@prisma/client';

import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  DocumentFiltersDto,
  DocumentStatus,
  DocumentSortBy,
  SortOrder,
} from './dto';
import { PaginatedDocuments, DocumentStats } from './documents.service';

describe('DocumentsController', () => {
  let controller: DocumentsController;
  let documentsService: DeepMockProxy<DocumentsService>;

  const mockUser: User = {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    role: 'editor',
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
  };

  const mockAdminUser: User = {
    ...mockUser,
    id: 'admin-user-id',
    email: 'admin@example.com',
    name: 'Admin User',
    role: 'admin',
  };

  const mockDocumentId = 'test-document-id';
  const mockIngestionId = 'test-ingestion-id';

  const createMockFrontendDocument = () => ({
    id: mockDocumentId,
    title: 'Test Document',
    description: 'Test document description',
    fileName: 'test-document.pdf',
    fileUrl: 'https://storage.example.com/documents/test-document.pdf',
    fileType: 'application/pdf',
    fileSize: 1024000,
    uploadedBy: mockUser.id,
    uploadedByName: mockUser.name,
    status: DocumentStatus.PENDING,
    tags: ['test', 'document'],
    category: 'general',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    uploader: {
      id: mockUser.id,
      name: mockUser.name,
      email: mockUser.email,
    },
  });

  const createMockFile = (
    overrides: Partial<Express.Multer.File> = {},
  ): Express.Multer.File => ({
    fieldname: 'file',
    originalname: 'test-document.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024000,
    buffer: Buffer.from('test file content'),
    destination: '',
    filename: '',
    path: '',
    stream: null as never,
    ...overrides,
  });

  const createMockPaginatedDocuments = (): PaginatedDocuments => ({
    documents: [createMockFrontendDocument()],
    pagination: {
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    },
    stats: {
      total: 1,
      processed: 0,
      pending: 1,
      failed: 0,
      totalSize: 1024000,
    },
  });

  const createMockDocumentStats = (): DocumentStats => ({
    total: 10,
    processed: 5,
    pending: 3,
    failed: 2,
    totalSize: 10240000,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        {
          provide: DocumentsService,
          useValue: mockDeep<DocumentsService>(),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<DocumentsController>(DocumentsController);
    documentsService = module.get(DocumentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadDocument', () => {
    const mockCreateDocumentDto: CreateDocumentDto = {
      title: 'Test Document',
      description: 'Test document description',
      tags: ['test', 'document'],
      category: 'general',
    };

    describe('Positive Cases', () => {
      it('should successfully upload a document with valid file and data', async () => {
        // Arrange
        const mockFile = createMockFile();
        const mockDocument = createMockFrontendDocument();

        documentsService.uploadDocument.mockResolvedValue(mockDocument);

        // Act
        const result = await controller.uploadDocument(
          mockFile,
          mockCreateDocumentDto,
          mockUser,
        );

        // Assert
        expect(documentsService.uploadDocument).toHaveBeenCalledWith(
          mockFile,
          mockCreateDocumentDto,
          mockUser.id,
        );

        expect(result).toEqual({
          success: true,
          data: mockDocument,
          message: 'Document uploaded successfully and queued for processing',
        });
      });

      it('should handle document upload with minimal required fields', async () => {
        // Arrange
        const minimalDto: CreateDocumentDto = {
          title: 'Minimal Document',
        };
        const mockFile = createMockFile();
        const mockDocument = createMockFrontendDocument();

        documentsService.uploadDocument.mockResolvedValue(mockDocument);

        // Act
        const result = await controller.uploadDocument(
          mockFile,
          minimalDto,
          mockUser,
        );

        // Assert
        expect(documentsService.uploadDocument).toHaveBeenCalledWith(
          mockFile,
          minimalDto,
          mockUser.id,
        );

        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockDocument);
      });

      it('should handle different file types correctly', async () => {
        // Arrange
        const testCases = [
          { mimetype: 'application/pdf', originalname: 'test.pdf' },
          { mimetype: 'application/msword', originalname: 'test.doc' },
          { mimetype: 'text/plain', originalname: 'test.txt' },
          { mimetype: 'image/jpeg', originalname: 'test.jpg' },
        ];

        for (const testCase of testCases) {
          const mockFile = createMockFile(testCase);
          const mockDocument = createMockFrontendDocument();

          documentsService.uploadDocument.mockResolvedValue(mockDocument);

          // Act
          const result = await controller.uploadDocument(
            mockFile,
            mockCreateDocumentDto,
            mockUser,
          );

          // Assert
          expect(result.success).toBe(true);
          expect(documentsService.uploadDocument).toHaveBeenCalledWith(
            mockFile,
            mockCreateDocumentDto,
            mockUser.id,
          );
        }
      });

      it('should handle upload for different user roles', async () => {
        // Arrange
        const mockFile = createMockFile();
        const mockDocument = createMockFrontendDocument();

        documentsService.uploadDocument.mockResolvedValue(mockDocument);

        // Act - Test with editor user
        const editorResult = await controller.uploadDocument(
          mockFile,
          mockCreateDocumentDto,
          mockUser,
        );

        // Act - Test with admin user
        const adminResult = await controller.uploadDocument(
          mockFile,
          mockCreateDocumentDto,
          mockAdminUser,
        );

        // Assert
        expect(editorResult.success).toBe(true);
        expect(adminResult.success).toBe(true);
        expect(documentsService.uploadDocument).toHaveBeenCalledTimes(2);
      });
    });

    describe('Negative Cases', () => {
      it('should throw error when file is not provided', async () => {
        // Act & Assert
        await expect(
          controller.uploadDocument(
            null as never,
            mockCreateDocumentDto,
            mockUser,
          ),
        ).rejects.toThrow('File is required');

        expect(documentsService.uploadDocument).not.toHaveBeenCalled();
      });

      it('should handle service errors gracefully', async () => {
        // Arrange
        const mockFile = createMockFile();
        const serviceError = new BadRequestException('File upload failed');

        documentsService.uploadDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.uploadDocument(mockFile, mockCreateDocumentDto, mockUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('should handle invalid file types', async () => {
        // Arrange
        const mockFile = createMockFile({
          mimetype: 'application/x-executable',
        });
        const serviceError = new BadRequestException('Invalid file type');

        documentsService.uploadDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.uploadDocument(mockFile, mockCreateDocumentDto, mockUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('should handle file size limit exceeded', async () => {
        // Arrange
        const mockFile = createMockFile({ size: 100 * 1024 * 1024 }); // 100MB
        const serviceError = new BadRequestException('File size exceeds limit');

        documentsService.uploadDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.uploadDocument(mockFile, mockCreateDocumentDto, mockUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('should handle database connection errors', async () => {
        // Arrange
        const mockFile = createMockFile();
        const serviceError = new Error('Database connection failed');

        documentsService.uploadDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.uploadDocument(mockFile, mockCreateDocumentDto, mockUser),
        ).rejects.toThrow(serviceError);
      });
    });
  });

  describe('getDocuments', () => {
    describe('Positive Cases', () => {
      it('should return paginated documents with default parameters', async () => {
        // Arrange
        const mockPaginatedDocuments = createMockPaginatedDocuments();
        documentsService.getDocuments.mockResolvedValue(mockPaginatedDocuments);

        // Act
        const result = await controller.getDocuments(1, 10, {}, mockUser);

        // Assert
        expect(documentsService.getDocuments).toHaveBeenCalledWith(
          1,
          10,
          expect.any(DocumentFiltersDto),
          mockUser.id,
          mockUser.role,
        );

        expect(result).toEqual({
          success: true,
          data: mockPaginatedDocuments,
        });
      });

      it('should handle custom pagination parameters', async () => {
        // Arrange
        const page = 3;
        const limit = 5;
        const mockPaginatedDocuments = createMockPaginatedDocuments();
        documentsService.getDocuments.mockResolvedValue(mockPaginatedDocuments);

        // Act
        const result = await controller.getDocuments(page, limit, {}, mockUser);

        // Assert
        expect(documentsService.getDocuments).toHaveBeenCalledWith(
          page,
          limit,
          expect.any(DocumentFiltersDto),
          mockUser.id,
          mockUser.role,
        );

        expect(result.success).toBe(true);
      });

      it('should apply filters correctly', async () => {
        // Arrange
        const queryParams = {
          search: 'test document',
          status: DocumentStatus.PROCESSED,
          category: 'general',
          tags: 'important,urgent',
          sortBy: DocumentSortBy.TITLE,
          sortOrder: SortOrder.ASC,
        };
        const mockPaginatedDocuments = createMockPaginatedDocuments();
        documentsService.getDocuments.mockResolvedValue(mockPaginatedDocuments);

        // Act
        const result = await controller.getDocuments(
          1,
          10,
          queryParams,
          mockUser,
        );

        // Assert
        expect(documentsService.getDocuments).toHaveBeenCalledWith(
          1,
          10,
          expect.objectContaining({
            search: 'test document',
            status: DocumentStatus.PROCESSED,
            category: 'general',
            tags: 'important,urgent',
            sortBy: DocumentSortBy.TITLE,
            sortOrder: SortOrder.ASC,
          }),
          mockUser.id,
          mockUser.role,
        );

        expect(result.success).toBe(true);
      });

      it('should exclude pagination parameters from filters', async () => {
        // Arrange
        const queryParams = {
          page: 2,
          limit: 20,
          search: 'test',
          status: DocumentStatus.PENDING,
        };
        const mockPaginatedDocuments = createMockPaginatedDocuments();
        documentsService.getDocuments.mockResolvedValue(mockPaginatedDocuments);

        // Act
        await controller.getDocuments(1, 10, queryParams, mockUser);

        // Assert
        expect(documentsService.getDocuments).toHaveBeenCalledWith(
          1,
          10,
          expect.objectContaining({
            search: 'test',
            status: DocumentStatus.PENDING,
          }),
          mockUser.id,
          mockUser.role,
        );

        // Verify pagination parameters are not in filters
        const filtersArg = documentsService.getDocuments.mock.calls[0][2];
        expect(filtersArg).not.toHaveProperty('page');
        expect(filtersArg).not.toHaveProperty('limit');
      });

      it('should handle empty query parameters', async () => {
        // Arrange
        const mockPaginatedDocuments = createMockPaginatedDocuments();
        documentsService.getDocuments.mockResolvedValue(mockPaginatedDocuments);

        // Act
        const result = await controller.getDocuments(1, 10, {}, mockUser);

        // Assert
        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockPaginatedDocuments);
      });

      it('should work for different user roles', async () => {
        // Arrange
        const mockPaginatedDocuments = createMockPaginatedDocuments();
        documentsService.getDocuments.mockResolvedValue(mockPaginatedDocuments);

        // Act - Test with editor user
        const editorResult = await controller.getDocuments(1, 10, {}, mockUser);

        // Act - Test with admin user
        const adminResult = await controller.getDocuments(
          1,
          10,
          {},
          mockAdminUser,
        );

        // Assert
        expect(editorResult.success).toBe(true);
        expect(adminResult.success).toBe(true);
        expect(documentsService.getDocuments).toHaveBeenCalledTimes(2);
      });
    });

    describe('Negative Cases', () => {
      it('should handle service errors gracefully', async () => {
        // Arrange
        const serviceError = new Error('Database connection failed');
        documentsService.getDocuments.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.getDocuments(1, 10, {}, mockUser),
        ).rejects.toThrow(serviceError);
      });

      it('should handle invalid pagination parameters', async () => {
        // Arrange
        const serviceError = new BadRequestException(
          'Invalid pagination parameters',
        );
        documentsService.getDocuments.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.getDocuments(-1, 0, {}, mockUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('should handle invalid filter parameters', async () => {
        // Arrange
        const invalidFilters = {
          status: 'invalid-status',
          sortBy: 'invalid-sort',
        };
        const serviceError = new BadRequestException(
          'Invalid filter parameters',
        );
        documentsService.getDocuments.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.getDocuments(1, 10, invalidFilters, mockUser),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });

  describe('getDocumentStats', () => {
    describe('Positive Cases', () => {
      it('should return document statistics for user', async () => {
        // Arrange
        const mockPaginatedDocuments = createMockPaginatedDocuments();
        documentsService.getDocuments.mockResolvedValue(mockPaginatedDocuments);

        // Act
        const result = await controller.getDocumentStats(mockUser);

        // Assert
        expect(documentsService.getDocuments).toHaveBeenCalledWith(
          1,
          1,
          {},
          mockUser.id,
          mockUser.role,
        );

        expect(result).toEqual({
          success: true,
          data: mockPaginatedDocuments.stats,
        });
      });

      it('should return document statistics for admin', async () => {
        // Arrange
        const mockPaginatedDocuments = createMockPaginatedDocuments();
        documentsService.getDocuments.mockResolvedValue(mockPaginatedDocuments);

        // Act
        const result = await controller.getDocumentStats(mockAdminUser);

        // Assert
        expect(documentsService.getDocuments).toHaveBeenCalledWith(
          1,
          1,
          {},
          mockAdminUser.id,
          mockAdminUser.role,
        );

        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockPaginatedDocuments.stats);
      });
    });

    describe('Negative Cases', () => {
      it('should handle service errors gracefully', async () => {
        // Arrange
        const serviceError = new Error('Database connection failed');
        documentsService.getDocuments.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(controller.getDocumentStats(mockUser)).rejects.toThrow(
          serviceError,
        );
      });
    });
  });

  describe('getDocumentById', () => {
    describe('Positive Cases', () => {
      it('should return document by id for authorized user', async () => {
        // Arrange
        const mockDocument = createMockFrontendDocument();
        documentsService.getDocumentById.mockResolvedValue(mockDocument);

        // Act
        const result = await controller.getDocumentById(
          mockDocumentId,
          mockUser,
        );

        // Assert
        expect(documentsService.getDocumentById).toHaveBeenCalledWith(
          mockDocumentId,
          mockUser.id,
          mockUser.role,
        );

        expect(result).toEqual({
          success: true,
          data: mockDocument,
        });
      });

      it('should return document by id for admin user', async () => {
        // Arrange
        const mockDocument = createMockFrontendDocument();
        documentsService.getDocumentById.mockResolvedValue(mockDocument);

        // Act
        const result = await controller.getDocumentById(
          mockDocumentId,
          mockAdminUser,
        );

        // Assert
        expect(documentsService.getDocumentById).toHaveBeenCalledWith(
          mockDocumentId,
          mockAdminUser.id,
          mockAdminUser.role,
        );

        expect(result.success).toBe(true);
      });
    });

    describe('Negative Cases', () => {
      it('should handle document not found', async () => {
        // Arrange
        const serviceError = new NotFoundException('Document not found');
        documentsService.getDocumentById.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.getDocumentById(mockDocumentId, mockUser),
        ).rejects.toThrow(NotFoundException);
      });

      it('should handle forbidden access', async () => {
        // Arrange
        const serviceError = new ForbiddenException(
          'Access denied to this document',
        );
        documentsService.getDocumentById.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.getDocumentById(mockDocumentId, mockUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should handle invalid document id format', async () => {
        // Arrange
        const invalidId = 'invalid-id';
        const serviceError = new BadRequestException(
          'Invalid document ID format',
        );
        documentsService.getDocumentById.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.getDocumentById(invalidId, mockUser),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });

  describe('updateDocument', () => {
    const mockUpdateDto: UpdateDocumentDto = {
      title: 'Updated Document Title',
      description: 'Updated description',
      tags: ['updated', 'test'],
      category: 'updated-category',
    };

    describe('Positive Cases', () => {
      it('should successfully update document for authorized user', async () => {
        // Arrange
        const mockUpdatedDocument = {
          ...createMockFrontendDocument(),
          ...mockUpdateDto,
        };
        documentsService.updateDocument.mockResolvedValue(mockUpdatedDocument);

        // Act
        const result = await controller.updateDocument(
          mockDocumentId,
          mockUpdateDto,
          mockUser,
        );

        // Assert
        expect(documentsService.updateDocument).toHaveBeenCalledWith(
          mockDocumentId,
          mockUpdateDto,
          mockUser.id,
          mockUser.role,
        );

        expect(result).toEqual({
          success: true,
          data: mockUpdatedDocument,
          message: 'Document updated successfully',
        });
      });

      it('should handle partial updates correctly', async () => {
        // Arrange
        const partialUpdateDto: UpdateDocumentDto = {
          title: 'Only Title Updated',
        };
        const mockUpdatedDocument = {
          ...createMockFrontendDocument(),
          title: partialUpdateDto.title || 'Default Title',
        };
        documentsService.updateDocument.mockResolvedValue(mockUpdatedDocument);

        // Act
        const result = await controller.updateDocument(
          mockDocumentId,
          partialUpdateDto,
          mockUser,
        );

        // Assert
        expect(documentsService.updateDocument).toHaveBeenCalledWith(
          mockDocumentId,
          partialUpdateDto,
          mockUser.id,
          mockUser.role,
        );

        expect(result.success).toBe(true);
        expect(result.data.title).toBe(partialUpdateDto.title);
      });

      it('should allow admin to update any document', async () => {
        // Arrange
        const mockUpdatedDocument = {
          ...createMockFrontendDocument(),
          ...mockUpdateDto,
        };
        documentsService.updateDocument.mockResolvedValue(mockUpdatedDocument);

        // Act
        const result = await controller.updateDocument(
          mockDocumentId,
          mockUpdateDto,
          mockAdminUser,
        );

        // Assert
        expect(documentsService.updateDocument).toHaveBeenCalledWith(
          mockDocumentId,
          mockUpdateDto,
          mockAdminUser.id,
          mockAdminUser.role,
        );

        expect(result.success).toBe(true);
      });
    });

    describe('Negative Cases', () => {
      it('should handle document not found', async () => {
        // Arrange
        const serviceError = new NotFoundException('Document not found');
        documentsService.updateDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.updateDocument(mockDocumentId, mockUpdateDto, mockUser),
        ).rejects.toThrow(NotFoundException);
      });

      it('should handle forbidden access', async () => {
        // Arrange
        const serviceError = new ForbiddenException(
          'Access denied to this document',
        );
        documentsService.updateDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.updateDocument(mockDocumentId, mockUpdateDto, mockUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should handle validation errors', async () => {
        // Arrange
        const invalidUpdateDto = {
          title: '', // Empty title should fail validation
        };
        const serviceError = new BadRequestException('Validation failed');
        documentsService.updateDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.updateDocument(
            mockDocumentId,
            invalidUpdateDto as never,
            mockUser,
          ),
        ).rejects.toThrow(BadRequestException);
      });

      it('should handle database update errors', async () => {
        // Arrange
        const serviceError = new Error('Database update failed');
        documentsService.updateDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.updateDocument(mockDocumentId, mockUpdateDto, mockUser),
        ).rejects.toThrow(serviceError);
      });
    });
  });

  describe('deleteDocument', () => {
    describe('Positive Cases', () => {
      it('should successfully delete document for authorized user', async () => {
        // Arrange
        documentsService.deleteDocument.mockResolvedValue(undefined);

        // Act
        const result = await controller.deleteDocument(
          mockDocumentId,
          mockUser,
        );

        // Assert
        expect(documentsService.deleteDocument).toHaveBeenCalledWith(
          mockDocumentId,
          mockUser.id,
          mockUser.role,
        );

        expect(result).toEqual({
          success: true,
          message: 'Document deleted successfully',
        });
      });

      it('should allow admin to delete any document', async () => {
        // Arrange
        documentsService.deleteDocument.mockResolvedValue(undefined);

        // Act
        const result = await controller.deleteDocument(
          mockDocumentId,
          mockAdminUser,
        );

        // Assert
        expect(documentsService.deleteDocument).toHaveBeenCalledWith(
          mockDocumentId,
          mockAdminUser.id,
          mockAdminUser.role,
        );

        expect(result.success).toBe(true);
      });
    });

    describe('Negative Cases', () => {
      it('should handle document not found', async () => {
        // Arrange
        const serviceError = new NotFoundException('Document not found');
        documentsService.deleteDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.deleteDocument(mockDocumentId, mockUser),
        ).rejects.toThrow(NotFoundException);
      });

      it('should handle forbidden access', async () => {
        // Arrange
        const serviceError = new ForbiddenException(
          'Access denied to this document',
        );
        documentsService.deleteDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.deleteDocument(mockDocumentId, mockUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should handle file deletion errors', async () => {
        // Arrange
        const serviceError = new BadRequestException(
          'Failed to delete file from storage',
        );
        documentsService.deleteDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.deleteDocument(mockDocumentId, mockUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('should handle database deletion errors', async () => {
        // Arrange
        const serviceError = new Error('Database deletion failed');
        documentsService.deleteDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.deleteDocument(mockDocumentId, mockUser),
        ).rejects.toThrow(serviceError);
      });
    });
  });

  describe('reprocessDocument', () => {
    describe('Positive Cases', () => {
      it('should successfully reprocess document for authorized user', async () => {
        // Arrange
        const mockReprocessResult = {
          document: createMockFrontendDocument(),
          ingestionId: mockIngestionId,
        };
        documentsService.reprocessDocument.mockResolvedValue(
          mockReprocessResult,
        );

        // Act
        const result = await controller.reprocessDocument(
          mockDocumentId,
          mockUser,
        );

        // Assert
        expect(documentsService.reprocessDocument).toHaveBeenCalledWith(
          mockDocumentId,
          mockUser.id,
          mockUser.role,
        );

        expect(result).toEqual({
          success: true,
          data: {
            id: mockReprocessResult.document.id,
            status: mockReprocessResult.document.status,
            ingestionId: mockReprocessResult.ingestionId,
          },
          message: 'Document queued for reprocessing',
        });
      });

      it('should allow admin to reprocess any document', async () => {
        // Arrange
        const mockReprocessResult = {
          document: createMockFrontendDocument(),
          ingestionId: mockIngestionId,
        };
        documentsService.reprocessDocument.mockResolvedValue(
          mockReprocessResult,
        );

        // Act
        const result = await controller.reprocessDocument(
          mockDocumentId,
          mockAdminUser,
        );

        // Assert
        expect(documentsService.reprocessDocument).toHaveBeenCalledWith(
          mockDocumentId,
          mockAdminUser.id,
          mockAdminUser.role,
        );

        expect(result.success).toBe(true);
      });
    });

    describe('Negative Cases', () => {
      it('should handle document not found', async () => {
        // Arrange
        const serviceError = new NotFoundException('Document not found');
        documentsService.reprocessDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.reprocessDocument(mockDocumentId, mockUser),
        ).rejects.toThrow(NotFoundException);
      });

      it('should handle forbidden access', async () => {
        // Arrange
        const serviceError = new ForbiddenException(
          'Access denied to this document',
        );
        documentsService.reprocessDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.reprocessDocument(mockDocumentId, mockUser),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should handle reprocessing errors', async () => {
        // Arrange
        const serviceError = new BadRequestException(
          'Failed to queue document for reprocessing',
        );
        documentsService.reprocessDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.reprocessDocument(mockDocumentId, mockUser),
        ).rejects.toThrow(BadRequestException);
      });

      it('should handle ingestion creation errors', async () => {
        // Arrange
        const serviceError = new Error('Ingestion creation failed');
        documentsService.reprocessDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.reprocessDocument(mockDocumentId, mockUser),
        ).rejects.toThrow(serviceError);
      });
    });
  });

  describe('getAllDocuments (Admin Only)', () => {
    describe('Positive Cases', () => {
      it('should return all documents for admin user', async () => {
        // Arrange
        const mockPaginatedDocuments = createMockPaginatedDocuments();
        documentsService.getDocuments.mockResolvedValue(mockPaginatedDocuments);

        // Act
        const result = await controller.getAllDocuments(1, 10, {});

        // Assert
        expect(documentsService.getDocuments).toHaveBeenCalledWith(
          1,
          10,
          expect.any(DocumentFiltersDto),
          undefined,
          'admin',
        );

        expect(result).toEqual({
          success: true,
          data: mockPaginatedDocuments,
        });
      });

      it('should apply filters correctly for admin endpoint', async () => {
        // Arrange
        const queryParams = {
          search: 'admin search',
          status: DocumentStatus.FAILED,
          category: 'admin-category',
        };
        const mockPaginatedDocuments = createMockPaginatedDocuments();
        documentsService.getDocuments.mockResolvedValue(mockPaginatedDocuments);

        // Act
        const result = await controller.getAllDocuments(1, 10, queryParams);

        // Assert
        expect(documentsService.getDocuments).toHaveBeenCalledWith(
          1,
          10,
          expect.objectContaining({
            search: 'admin search',
            status: DocumentStatus.FAILED,
            category: 'admin-category',
          }),
          undefined,
          'admin',
        );

        expect(result.success).toBe(true);
      });

      it('should handle custom pagination for admin endpoint', async () => {
        // Arrange
        const page = 5;
        const limit = 20;
        const mockPaginatedDocuments = createMockPaginatedDocuments();
        documentsService.getDocuments.mockResolvedValue(mockPaginatedDocuments);

        // Act
        const result = await controller.getAllDocuments(page, limit, {});

        // Assert
        expect(documentsService.getDocuments).toHaveBeenCalledWith(
          page,
          limit,
          expect.any(DocumentFiltersDto),
          undefined,
          'admin',
        );

        expect(result.success).toBe(true);
      });
    });

    describe('Negative Cases', () => {
      it('should handle service errors gracefully', async () => {
        // Arrange
        const serviceError = new Error('Database connection failed');
        documentsService.getDocuments.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(controller.getAllDocuments(1, 10, {})).rejects.toThrow(
          serviceError,
        );
      });
    });
  });

  describe('getAnyDocumentById (Admin Only)', () => {
    describe('Positive Cases', () => {
      it('should return any document by id for admin user', async () => {
        // Arrange
        const mockDocument = createMockFrontendDocument();
        documentsService.getDocumentById.mockResolvedValue(mockDocument);

        // Act
        const result = await controller.getAnyDocumentById(mockDocumentId);

        // Assert
        expect(documentsService.getDocumentById).toHaveBeenCalledWith(
          mockDocumentId,
          undefined,
          'admin',
        );

        expect(result).toEqual({
          success: true,
          data: mockDocument,
        });
      });
    });

    describe('Negative Cases', () => {
      it('should handle document not found', async () => {
        // Arrange
        const serviceError = new NotFoundException('Document not found');
        documentsService.getDocumentById.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.getAnyDocumentById(mockDocumentId),
        ).rejects.toThrow(NotFoundException);
      });

      it('should handle database errors', async () => {
        // Arrange
        const serviceError = new Error('Database connection failed');
        documentsService.getDocumentById.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.getAnyDocumentById(mockDocumentId),
        ).rejects.toThrow(serviceError);
      });
    });
  });

  describe('deleteAnyDocument (Admin Only)', () => {
    describe('Positive Cases', () => {
      it('should successfully delete any document for admin user', async () => {
        // Arrange
        documentsService.deleteDocument.mockResolvedValue(undefined);

        // Act
        const result = await controller.deleteAnyDocument(mockDocumentId);

        // Assert
        expect(documentsService.deleteDocument).toHaveBeenCalledWith(
          mockDocumentId,
          undefined,
          'admin',
        );

        expect(result).toEqual({
          success: true,
          message: 'Document deleted successfully',
        });
      });
    });

    describe('Negative Cases', () => {
      it('should handle document not found', async () => {
        // Arrange
        const serviceError = new NotFoundException('Document not found');
        documentsService.deleteDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.deleteAnyDocument(mockDocumentId),
        ).rejects.toThrow(NotFoundException);
      });

      it('should handle deletion errors', async () => {
        // Arrange
        const serviceError = new BadRequestException(
          'Failed to delete document',
        );
        documentsService.deleteDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.deleteAnyDocument(mockDocumentId),
        ).rejects.toThrow(BadRequestException);
      });

      it('should handle database errors', async () => {
        // Arrange
        const serviceError = new Error('Database deletion failed');
        documentsService.deleteDocument.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(
          controller.deleteAnyDocument(mockDocumentId),
        ).rejects.toThrow(serviceError);
      });
    });
  });
});
