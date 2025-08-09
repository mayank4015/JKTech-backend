import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { Document, Prisma } from '@prisma/client';

import { DocumentsService } from './documents.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import { FileUploadService } from '../common/file-upload/file-upload.service';
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  DocumentFiltersDto,
  DocumentStatus,
  DocumentSortBy,
  SortOrder,
} from './dto';
import {
  DocumentWithUploader,
  DocumentStats,
  PaginatedDocuments,
} from './documents.service';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let prismaService: DeepMockProxy<PrismaService>;
  let loggerService: DeepMockProxy<LoggerService>;
  let fileUploadService: DeepMockProxy<FileUploadService>;

  const mockUserId = 'test-user-id';
  const mockAdminUserId = 'admin-user-id';
  const mockDocumentId = 'test-document-id';
  const mockIngestionId = 'test-ingestion-id';

  const createMockDocument = (overrides: Partial<Document> = {}): Document => ({
    id: mockDocumentId,
    title: 'Test Document',
    description: 'Test document description',
    fileName: 'test-document.pdf',
    fileUrl: 'https://storage.example.com/documents/test-document.pdf',
    fileType: 'application/pdf',
    fileSize: BigInt(1024000),
    uploadedBy: mockUserId,
    status: DocumentStatus.PENDING,
    tags: ['test', 'document'],
    category: 'general',
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  });

  const createMockDocumentWithUploader = (
    overrides: Partial<DocumentWithUploader> = {},
  ): DocumentWithUploader => ({
    ...createMockDocument(),
    fileSize: '1024000',
    uploader: {
      id: mockUserId,
      name: 'Test User',
      email: 'test@example.com',
    },
    ...overrides,
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

  const createMockUploadResult = () => ({
    fileName: 'test-document.pdf',
    url: 'https://storage.example.com/documents/test-document.pdf',
    mimeType: 'application/pdf',
    fileSize: 1024000,
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
      providers: [
        DocumentsService,
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaService>(),
        },
        {
          provide: LoggerService,
          useValue: mockDeep<LoggerService>(),
        },
        {
          provide: FileUploadService,
          useValue: mockDeep<FileUploadService>(),
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
    prismaService = module.get(PrismaService);
    loggerService = module.get(LoggerService);
    fileUploadService = module.get(FileUploadService);
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
        const mockUploadResult = createMockUploadResult();
        const mockDocument = createMockDocumentWithUploader();
        const mockIngestion = { id: mockIngestionId };

        fileUploadService.uploadFile.mockResolvedValue(mockUploadResult);
        prismaService.document.create.mockResolvedValue(mockDocument as never);
        prismaService.ingestion.create.mockResolvedValue(
          mockIngestion as never,
        );

        // Act
        const result = await service.uploadDocument(
          mockFile,
          mockCreateDocumentDto,
          mockUserId,
        );

        // Assert
        expect(fileUploadService.uploadFile).toHaveBeenCalledWith(
          mockFile,
          'documents',
          expect.arrayContaining([
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
          ]),
        );

        expect(prismaService.document.create).toHaveBeenCalledWith({
          data: {
            title: mockCreateDocumentDto.title,
            description: mockCreateDocumentDto.description,
            fileName: mockUploadResult.fileName,
            fileUrl: mockUploadResult.url,
            fileType: mockUploadResult.mimeType,
            fileSize: BigInt(mockUploadResult.fileSize),
            uploadedBy: mockUserId,
            status: DocumentStatus.PENDING,
            tags: mockCreateDocumentDto.tags,
            category: mockCreateDocumentDto.category,
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

        expect(prismaService.ingestion.create).toHaveBeenCalledWith({
          data: {
            documentId: mockDocument.id,
            userId: mockUserId,
            status: 'queued',
            progress: 0,
          },
        });

        expect(loggerService.debug).toHaveBeenCalledWith(
          `Uploading document: ${mockCreateDocumentDto.title} by user: ${mockUserId}`,
        );
        expect(loggerService.debug).toHaveBeenCalledWith(
          `Document uploaded successfully: ${mockDocument.id}`,
        );

        expect(result).toEqual(
          expect.objectContaining({
            id: mockDocument.id,
            title: mockDocument.title,
            status: mockDocument.status,
          }),
        );
      });

      it('should handle document upload with minimal required fields', async () => {
        // Arrange
        const minimalDto: CreateDocumentDto = {
          title: 'Minimal Document',
        };
        const mockFile = createMockFile();
        const mockUploadResult = createMockUploadResult();
        const mockDocument = createMockDocumentWithUploader({
          title: 'Minimal Document',
          description: null,
          tags: [],
          category: null,
        });

        fileUploadService.uploadFile.mockResolvedValue(mockUploadResult);
        prismaService.document.create.mockResolvedValue(mockDocument as never);
        prismaService.ingestion.create.mockResolvedValue({
          id: mockIngestionId,
        } as never);

        // Act
        const result = await service.uploadDocument(
          mockFile,
          minimalDto,
          mockUserId,
        );

        // Assert
        expect(prismaService.document.create).toHaveBeenCalledWith({
          data: {
            title: minimalDto.title,
            description: undefined,
            fileName: mockUploadResult.fileName,
            fileUrl: mockUploadResult.url,
            fileType: mockUploadResult.mimeType,
            fileSize: BigInt(mockUploadResult.fileSize),
            uploadedBy: mockUserId,
            status: DocumentStatus.PENDING,
            tags: [],
            category: undefined,
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

        expect(result.title).toBe('Minimal Document');
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
          const mockUploadResult = createMockUploadResult();
          const mockDocument = createMockDocumentWithUploader();

          fileUploadService.uploadFile.mockResolvedValue(mockUploadResult);
          prismaService.document.create.mockResolvedValue(
            mockDocument as never,
          );
          prismaService.ingestion.create.mockResolvedValue({
            id: mockIngestionId,
          } as never);

          // Act
          const result = await service.uploadDocument(
            mockFile,
            mockCreateDocumentDto,
            mockUserId,
          );

          // Assert
          expect(result).toBeDefined();
          expect(fileUploadService.uploadFile).toHaveBeenCalledWith(
            mockFile,
            'documents',
            expect.any(Array),
          );
        }
      });
    });

    describe('Negative Cases', () => {
      it('should throw BadRequestException when file upload fails', async () => {
        // Arrange
        const mockFile = createMockFile();
        const uploadError = new Error('File upload failed');
        fileUploadService.uploadFile.mockRejectedValue(uploadError);

        // Act & Assert
        await expect(
          service.uploadDocument(mockFile, mockCreateDocumentDto, mockUserId),
        ).rejects.toThrow(BadRequestException);

        expect(loggerService.error).toHaveBeenCalledWith(
          `Failed to upload document: ${uploadError.message}`,
          uploadError.stack,
        );
      });

      it('should throw BadRequestException when database creation fails', async () => {
        // Arrange
        const mockFile = createMockFile();
        const mockUploadResult = createMockUploadResult();
        const dbError = new Error('Database connection failed');

        fileUploadService.uploadFile.mockResolvedValue(mockUploadResult);
        prismaService.document.create.mockRejectedValue(dbError);

        // Act & Assert
        await expect(
          service.uploadDocument(mockFile, mockCreateDocumentDto, mockUserId),
        ).rejects.toThrow(BadRequestException);

        expect(loggerService.error).toHaveBeenCalledWith(
          `Failed to upload document: ${dbError.message}`,
          dbError.stack,
        );
      });

      it('should throw BadRequestException when ingestion creation fails', async () => {
        // Arrange
        const mockFile = createMockFile();
        const mockUploadResult = createMockUploadResult();
        const mockDocument = createMockDocumentWithUploader();
        const ingestionError = new Error('Ingestion creation failed');

        fileUploadService.uploadFile.mockResolvedValue(mockUploadResult);
        prismaService.document.create.mockResolvedValue(mockDocument as never);
        prismaService.ingestion.create.mockRejectedValue(ingestionError);

        // Act & Assert
        await expect(
          service.uploadDocument(mockFile, mockCreateDocumentDto, mockUserId),
        ).rejects.toThrow(BadRequestException);
      });

      it('should handle invalid file type gracefully', async () => {
        // Arrange
        const mockFile = createMockFile({
          mimetype: 'application/x-executable',
        });
        const uploadError = new Error('Invalid file type');
        fileUploadService.uploadFile.mockRejectedValue(uploadError);

        // Act & Assert
        await expect(
          service.uploadDocument(mockFile, mockCreateDocumentDto, mockUserId),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });

  describe('getDocuments', () => {
    const mockDocuments = [
      createMockDocumentWithUploader(),
      createMockDocumentWithUploader({
        id: 'doc-2',
        title: 'Second Document',
        status: DocumentStatus.PROCESSED,
      }),
    ];

    describe('Positive Cases', () => {
      it('should return paginated documents with default parameters', async () => {
        // Arrange
        const mockStats = createMockDocumentStats();
        prismaService.document.findMany.mockResolvedValue(
          mockDocuments as never,
        );
        prismaService.document.count.mockResolvedValue(2);
        const getDocumentStatsSpy = jest.spyOn(
          service,
          'getDocumentStats' as keyof DocumentsService,
        );
        (
          getDocumentStatsSpy as unknown as jest.MockedFunction<
            (where: Prisma.DocumentWhereInput) => Promise<DocumentStats>
          >
        ).mockResolvedValue(mockStats);

        // Act
        const result = await service.getDocuments();

        // Assert
        expect(prismaService.document.findMany).toHaveBeenCalledWith({
          where: {},
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
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

        expect(result).toEqual({
          documents: expect.any(Array),
          pagination: {
            total: 2,
            page: 1,
            limit: 10,
            totalPages: 1,
          },
          stats: mockStats,
        });
      });

      it('should apply search filters correctly', async () => {
        // Arrange
        const filters: DocumentFiltersDto = {
          search: 'test document',
        };
        const mockStats = createMockDocumentStats();

        prismaService.document.findMany.mockResolvedValue(
          mockDocuments as never,
        );
        prismaService.document.count.mockResolvedValue(1);
        const getDocumentStatsSpy = jest.spyOn(
          service,
          'getDocumentStats' as keyof DocumentsService,
        );
        (
          getDocumentStatsSpy as unknown as jest.MockedFunction<
            (where: Prisma.DocumentWhereInput) => Promise<DocumentStats>
          >
        ).mockResolvedValue(mockStats);

        // Act
        await service.getDocuments(1, 10, filters);

        // Assert
        expect(prismaService.document.findMany).toHaveBeenCalledWith({
          where: {
            OR: [
              { title: { contains: 'test document', mode: 'insensitive' } },
              {
                description: { contains: 'test document', mode: 'insensitive' },
              },
              { fileName: { contains: 'test document', mode: 'insensitive' } },
              { tags: { hasSome: ['test document'] } },
            ],
          },
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
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
      });

      it('should apply status filter correctly', async () => {
        // Arrange
        const filters: DocumentFiltersDto = {
          status: DocumentStatus.PROCESSED,
        };
        const mockStats = createMockDocumentStats();

        prismaService.document.findMany.mockResolvedValue([
          mockDocuments[1],
        ] as never);
        prismaService.document.count.mockResolvedValue(1);
        const getDocumentStatsSpy = jest.spyOn(
          service,
          'getDocumentStats' as keyof DocumentsService,
        );
        (
          getDocumentStatsSpy as unknown as jest.MockedFunction<
            (where: Prisma.DocumentWhereInput) => Promise<DocumentStats>
          >
        ).mockResolvedValue(mockStats);

        // Act
        await service.getDocuments(1, 10, filters);

        // Assert
        expect(prismaService.document.findMany).toHaveBeenCalledWith({
          where: { status: DocumentStatus.PROCESSED },
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
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
      });

      it('should apply multiple filters correctly', async () => {
        // Arrange
        const filters: DocumentFiltersDto = {
          search: 'test',
          status: DocumentStatus.PROCESSED,
          category: 'general',
          tags: ['important', 'urgent'],
          uploadedBy: mockUserId,
          dateStart: '2024-01-01',
          dateEnd: '2024-12-31',
        };
        const mockStats = createMockDocumentStats();

        prismaService.document.findMany.mockResolvedValue(
          mockDocuments as never,
        );
        prismaService.document.count.mockResolvedValue(2);
        const getDocumentStatsSpy = jest.spyOn(
          service,
          'getDocumentStats' as keyof DocumentsService,
        );
        (
          getDocumentStatsSpy as unknown as jest.MockedFunction<
            (where: Prisma.DocumentWhereInput) => Promise<DocumentStats>
          >
        ).mockResolvedValue(mockStats);

        // Act
        await service.getDocuments(1, 10, filters, mockUserId, 'editor');

        // Assert
        expect(prismaService.document.findMany).toHaveBeenCalledWith({
          where: {
            OR: [
              { title: { contains: 'test', mode: 'insensitive' } },
              { description: { contains: 'test', mode: 'insensitive' } },
              { fileName: { contains: 'test', mode: 'insensitive' } },
              { tags: { hasSome: ['test'] } },
            ],
            status: DocumentStatus.PROCESSED,
            category: 'general',
            tags: { hasSome: ['important', 'urgent'] },
            uploadedBy: mockUserId,
            createdAt: {
              gte: new Date('2024-01-01'),
              lte: new Date('2024-12-31'),
            },
          },
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
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
      });

      it('should apply sorting correctly', async () => {
        // Arrange
        const filters: DocumentFiltersDto = {
          sortBy: DocumentSortBy.TITLE,
          sortOrder: SortOrder.ASC,
        };
        const mockStats = createMockDocumentStats();

        prismaService.document.findMany.mockResolvedValue(
          mockDocuments as never,
        );
        prismaService.document.count.mockResolvedValue(2);
        const getDocumentStatsSpy = jest.spyOn(
          service,
          'getDocumentStats' as keyof DocumentsService,
        );
        (
          getDocumentStatsSpy as unknown as jest.MockedFunction<
            (where: Prisma.DocumentWhereInput) => Promise<DocumentStats>
          >
        ).mockResolvedValue(mockStats);

        // Act
        await service.getDocuments(1, 10, filters);

        // Assert
        expect(prismaService.document.findMany).toHaveBeenCalledWith({
          where: {},
          skip: 0,
          take: 10,
          orderBy: { title: 'asc' },
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
      });

      it('should handle pagination correctly', async () => {
        // Arrange
        const page = 3;
        const limit = 5;
        const mockStats = createMockDocumentStats();

        prismaService.document.findMany.mockResolvedValue(
          mockDocuments as never,
        );
        prismaService.document.count.mockResolvedValue(15);
        const getDocumentStatsSpy = jest.spyOn(
          service,
          'getDocumentStats' as keyof DocumentsService,
        );
        (
          getDocumentStatsSpy as unknown as jest.MockedFunction<
            (where: Prisma.DocumentWhereInput) => Promise<DocumentStats>
          >
        ).mockResolvedValue(mockStats);

        // Act
        const result = await service.getDocuments(page, limit);

        // Assert
        expect(prismaService.document.findMany).toHaveBeenCalledWith({
          where: {},
          skip: 10, // (3-1) * 5
          take: 5,
          orderBy: { createdAt: 'desc' },
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

        expect(result.pagination).toEqual({
          total: 15,
          page: 3,
          limit: 5,
          totalPages: 3,
        });
      });

      it('should apply role-based access control for non-admin users', async () => {
        // Arrange
        const mockStats = createMockDocumentStats();
        prismaService.document.findMany.mockResolvedValue(
          mockDocuments as never,
        );
        prismaService.document.count.mockResolvedValue(2);
        const getDocumentStatsSpy = jest.spyOn(
          service,
          'getDocumentStats' as keyof DocumentsService,
        );
        (
          getDocumentStatsSpy as unknown as jest.MockedFunction<
            (where: Prisma.DocumentWhereInput) => Promise<DocumentStats>
          >
        ).mockResolvedValue(mockStats);

        // Act
        await service.getDocuments(1, 10, {}, mockUserId, 'editor');

        // Assert
        expect(prismaService.document.findMany).toHaveBeenCalledWith({
          where: { uploadedBy: mockUserId },
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
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
      });

      it('should not apply role-based access control for admin users', async () => {
        // Arrange
        const mockStats = createMockDocumentStats();
        prismaService.document.findMany.mockResolvedValue(
          mockDocuments as never,
        );
        prismaService.document.count.mockResolvedValue(2);
        const getDocumentStatsSpy = jest.spyOn(
          service,
          'getDocumentStats' as keyof DocumentsService,
        );
        (
          getDocumentStatsSpy as unknown as jest.MockedFunction<
            (where: Prisma.DocumentWhereInput) => Promise<DocumentStats>
          >
        ).mockResolvedValue(mockStats);

        // Act
        await service.getDocuments(1, 10, {}, mockAdminUserId, 'admin');

        // Assert
        expect(prismaService.document.findMany).toHaveBeenCalledWith({
          where: {},
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
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
      });
    });

    describe('Negative Cases', () => {
      it('should handle database errors gracefully', async () => {
        // Arrange
        const dbError = new Error('Database connection failed');
        prismaService.document.findMany.mockRejectedValue(dbError);

        // Act & Assert
        await expect(service.getDocuments()).rejects.toThrow(dbError);
      });

      it('should handle invalid date filters gracefully', async () => {
        // Arrange
        const filters: DocumentFiltersDto = {
          dateStart: 'invalid-date',
          dateEnd: 'invalid-date',
        };

        // Act & Assert
        await expect(service.getDocuments(1, 10, filters)).rejects.toThrow();
      });
    });
  });

  describe('getDocumentById', () => {
    const mockDocumentWithIngestions = {
      ...createMockDocumentWithUploader(),
      ingestions: [
        {
          id: mockIngestionId,
          status: 'completed',
          progress: 100,
          startedAt: new Date('2024-01-01T00:00:00.000Z'),
          completedAt: new Date('2024-01-01T01:00:00.000Z'),
          error: null,
        },
      ],
    };

    describe('Positive Cases', () => {
      it('should return document by id for document owner', async () => {
        // Arrange
        prismaService.document.findUnique.mockResolvedValue(
          mockDocumentWithIngestions as never,
        );

        // Act
        const result = await service.getDocumentById(
          mockDocumentId,
          mockUserId,
          'editor',
        );

        // Assert
        expect(prismaService.document.findUnique).toHaveBeenCalledWith({
          where: { id: mockDocumentId },
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

        expect(result).toEqual(
          expect.objectContaining({
            id: mockDocumentId,
            title: 'Test Document',
          }),
        );
      });

      it('should return document by id for admin user', async () => {
        // Arrange
        const otherUserDocument = {
          ...mockDocumentWithIngestions,
          uploadedBy: 'other-user-id',
        };
        prismaService.document.findUnique.mockResolvedValue(
          otherUserDocument as never,
        );

        // Act
        const result = await service.getDocumentById(
          mockDocumentId,
          mockAdminUserId,
          'admin',
        );

        // Assert
        expect(result).toEqual(
          expect.objectContaining({
            id: mockDocumentId,
            title: 'Test Document',
          }),
        );
      });
    });

    describe('Negative Cases', () => {
      it('should throw NotFoundException when document does not exist', async () => {
        // Arrange
        prismaService.document.findUnique.mockResolvedValue(null);

        // Act & Assert
        await expect(
          service.getDocumentById(mockDocumentId, mockUserId, 'editor'),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw ForbiddenException when non-admin user tries to access other user document', async () => {
        // Arrange
        const otherUserDocument = {
          ...mockDocumentWithIngestions,
          uploadedBy: 'other-user-id',
        };
        prismaService.document.findUnique.mockResolvedValue(
          otherUserDocument as never,
        );

        // Act & Assert
        await expect(
          service.getDocumentById(mockDocumentId, mockUserId, 'editor'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should handle database errors gracefully', async () => {
        // Arrange
        const dbError = new Error('Database connection failed');
        prismaService.document.findUnique.mockRejectedValue(dbError);

        // Act & Assert
        await expect(
          service.getDocumentById(mockDocumentId, mockUserId, 'editor'),
        ).rejects.toThrow(dbError);
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
      it('should successfully update document for owner', async () => {
        // Arrange
        const existingDocument = createMockDocument();
        const updatedDocument = createMockDocumentWithUploader({
          ...existingDocument,
          ...mockUpdateDto,
          fileSize: existingDocument.fileSize.toString(),
        });

        prismaService.document.findUnique.mockResolvedValue(existingDocument);
        prismaService.document.update.mockResolvedValue(
          updatedDocument as never,
        );

        // Act
        const result = await service.updateDocument(
          mockDocumentId,
          mockUpdateDto,
          mockUserId,
          'editor',
        );

        // Assert
        expect(prismaService.document.findUnique).toHaveBeenCalledWith({
          where: { id: mockDocumentId },
        });

        expect(prismaService.document.update).toHaveBeenCalledWith({
          where: { id: mockDocumentId },
          data: {
            ...mockUpdateDto,
            updatedAt: new Date('2024-01-01T00:00:00.000Z'),
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

        expect(loggerService.debug).toHaveBeenCalledWith(
          `Document updated: ${mockDocumentId}`,
        );
        expect(result.title).toBe(mockUpdateDto.title);
      });

      it('should successfully update document for admin', async () => {
        // Arrange
        const existingDocument = createMockDocument({
          uploadedBy: 'other-user-id',
        });
        const updatedDocument = createMockDocumentWithUploader({
          ...existingDocument,
          ...mockUpdateDto,
          fileSize: existingDocument.fileSize.toString(),
        });

        prismaService.document.findUnique.mockResolvedValue(existingDocument);
        prismaService.document.update.mockResolvedValue(
          updatedDocument as never,
        );

        // Act
        const result = await service.updateDocument(
          mockDocumentId,
          mockUpdateDto,
          mockAdminUserId,
          'admin',
        );

        // Assert
        expect(result.title).toBe(mockUpdateDto.title);
      });

      it('should handle partial updates correctly', async () => {
        // Arrange
        const partialUpdateDto: UpdateDocumentDto = {
          title: 'Only Title Updated',
        };
        const existingDocument = createMockDocument();
        const updatedDocument = createMockDocumentWithUploader({
          ...existingDocument,
          title: partialUpdateDto.title,
          fileSize: existingDocument.fileSize.toString(),
        });

        prismaService.document.findUnique.mockResolvedValue(existingDocument);
        prismaService.document.update.mockResolvedValue(
          updatedDocument as never,
        );

        // Act
        const result = await service.updateDocument(
          mockDocumentId,
          partialUpdateDto,
          mockUserId,
          'editor',
        );

        // Assert
        expect(prismaService.document.update).toHaveBeenCalledWith({
          where: { id: mockDocumentId },
          data: {
            title: partialUpdateDto.title,
            updatedAt: new Date('2024-01-01T00:00:00.000Z'),
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

        expect(result.title).toBe(partialUpdateDto.title);
      });
    });

    describe('Negative Cases', () => {
      it('should throw NotFoundException when document does not exist', async () => {
        // Arrange
        prismaService.document.findUnique.mockResolvedValue(null);

        // Act & Assert
        await expect(
          service.updateDocument(
            mockDocumentId,
            mockUpdateDto,
            mockUserId,
            'editor',
          ),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw ForbiddenException when non-admin user tries to update other user document', async () => {
        // Arrange
        const otherUserDocument = createMockDocument({
          uploadedBy: 'other-user-id',
        });
        prismaService.document.findUnique.mockResolvedValue(otherUserDocument);

        // Act & Assert
        await expect(
          service.updateDocument(
            mockDocumentId,
            mockUpdateDto,
            mockUserId,
            'editor',
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should handle database update errors gracefully', async () => {
        // Arrange
        const existingDocument = createMockDocument();
        const dbError = new Error('Database update failed');

        prismaService.document.findUnique.mockResolvedValue(existingDocument);
        prismaService.document.update.mockRejectedValue(dbError);

        // Act & Assert
        await expect(
          service.updateDocument(
            mockDocumentId,
            mockUpdateDto,
            mockUserId,
            'editor',
          ),
        ).rejects.toThrow(dbError);
      });
    });
  });

  describe('deleteDocument', () => {
    describe('Positive Cases', () => {
      it('should successfully delete document for owner', async () => {
        // Arrange
        const existingDocument = createMockDocument();
        const filePath = 'documents/test-document.pdf';

        prismaService.document.findUnique.mockResolvedValue(existingDocument);
        fileUploadService.extractFilePathFromUrl.mockReturnValue(filePath);
        fileUploadService.deleteFile.mockResolvedValue(undefined);
        prismaService.document.delete.mockResolvedValue(existingDocument);

        // Act
        await service.deleteDocument(mockDocumentId, mockUserId, 'editor');

        // Assert
        expect(prismaService.document.findUnique).toHaveBeenCalledWith({
          where: { id: mockDocumentId },
        });

        expect(fileUploadService.extractFilePathFromUrl).toHaveBeenCalledWith(
          existingDocument.fileUrl,
        );

        expect(fileUploadService.deleteFile).toHaveBeenCalledWith(filePath);

        expect(prismaService.document.delete).toHaveBeenCalledWith({
          where: { id: mockDocumentId },
        });

        expect(loggerService.debug).toHaveBeenCalledWith(
          `Document deleted: ${mockDocumentId}`,
        );
      });

      it('should successfully delete document for admin', async () => {
        // Arrange
        const existingDocument = createMockDocument({
          uploadedBy: 'other-user-id',
        });
        const filePath = 'documents/test-document.pdf';

        prismaService.document.findUnique.mockResolvedValue(existingDocument);
        fileUploadService.extractFilePathFromUrl.mockReturnValue(filePath);
        fileUploadService.deleteFile.mockResolvedValue(undefined);
        prismaService.document.delete.mockResolvedValue(existingDocument);

        // Act
        await service.deleteDocument(mockDocumentId, mockAdminUserId, 'admin');

        // Assert
        expect(prismaService.document.delete).toHaveBeenCalledWith({
          where: { id: mockDocumentId },
        });
      });

      it('should handle missing file path gracefully', async () => {
        // Arrange
        const existingDocument = createMockDocument();

        prismaService.document.findUnique.mockResolvedValue(existingDocument);
        fileUploadService.extractFilePathFromUrl.mockReturnValue('');
        prismaService.document.delete.mockResolvedValue(existingDocument);

        // Act
        await service.deleteDocument(mockDocumentId, mockUserId, 'editor');

        // Assert
        expect(fileUploadService.deleteFile).not.toHaveBeenCalled();
        expect(prismaService.document.delete).toHaveBeenCalledWith({
          where: { id: mockDocumentId },
        });
      });
    });

    describe('Negative Cases', () => {
      it('should throw NotFoundException when document does not exist', async () => {
        // Arrange
        prismaService.document.findUnique.mockResolvedValue(null);

        // Act & Assert
        await expect(
          service.deleteDocument(mockDocumentId, mockUserId, 'editor'),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw ForbiddenException when non-admin user tries to delete other user document', async () => {
        // Arrange
        const otherUserDocument = createMockDocument({
          uploadedBy: 'other-user-id',
        });
        prismaService.document.findUnique.mockResolvedValue(otherUserDocument);

        // Act & Assert
        await expect(
          service.deleteDocument(mockDocumentId, mockUserId, 'editor'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw BadRequestException when file deletion fails', async () => {
        // Arrange
        const existingDocument = createMockDocument();
        const filePath = 'documents/test-document.pdf';
        const fileError = new Error('File deletion failed');

        prismaService.document.findUnique.mockResolvedValue(existingDocument);
        fileUploadService.extractFilePathFromUrl.mockReturnValue(filePath);
        fileUploadService.deleteFile.mockRejectedValue(fileError);

        // Act & Assert
        await expect(
          service.deleteDocument(mockDocumentId, mockUserId, 'editor'),
        ).rejects.toThrow(BadRequestException);

        expect(loggerService.error).toHaveBeenCalledWith(
          `Failed to delete document: ${fileError.message}`,
          fileError.stack,
        );
      });

      it('should throw BadRequestException when database deletion fails', async () => {
        // Arrange
        const existingDocument = createMockDocument();
        const filePath = 'documents/test-document.pdf';
        const dbError = new Error('Database deletion failed');

        prismaService.document.findUnique.mockResolvedValue(existingDocument);
        fileUploadService.extractFilePathFromUrl.mockReturnValue(filePath);
        fileUploadService.deleteFile.mockResolvedValue(undefined);
        prismaService.document.delete.mockRejectedValue(dbError);

        // Act & Assert
        await expect(
          service.deleteDocument(mockDocumentId, mockUserId, 'editor'),
        ).rejects.toThrow(BadRequestException);

        expect(loggerService.error).toHaveBeenCalledWith(
          `Failed to delete document: ${dbError.message}`,
          dbError.stack,
        );
      });
    });
  });

  describe('reprocessDocument', () => {
    describe('Positive Cases', () => {
      it('should successfully reprocess document for owner', async () => {
        // Arrange
        const existingDocument = createMockDocument();
        const updatedDocument = createMockDocumentWithUploader({
          ...existingDocument,
          status: DocumentStatus.PENDING,
          fileSize: existingDocument.fileSize.toString(),
        });
        const newIngestion = { id: 'new-ingestion-id' };

        prismaService.document.findUnique.mockResolvedValue(existingDocument);
        prismaService.document.update.mockResolvedValue(
          updatedDocument as never,
        );
        prismaService.ingestion.create.mockResolvedValue(newIngestion as never);

        // Act
        const result = await service.reprocessDocument(
          mockDocumentId,
          mockUserId,
          'editor',
        );

        // Assert
        expect(prismaService.document.findUnique).toHaveBeenCalledWith({
          where: { id: mockDocumentId },
        });

        expect(prismaService.document.update).toHaveBeenCalledWith({
          where: { id: mockDocumentId },
          data: {
            status: DocumentStatus.PENDING,
            updatedAt: new Date('2024-01-01T00:00:00.000Z'),
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

        expect(prismaService.ingestion.create).toHaveBeenCalledWith({
          data: {
            documentId: mockDocumentId,
            userId: mockUserId,
            status: 'queued',
            progress: 0,
          },
        });

        expect(loggerService.debug).toHaveBeenCalledWith(
          `Document queued for reprocessing: ${mockDocumentId}`,
        );

        expect(result).toEqual({
          document: expect.objectContaining({
            id: mockDocumentId,
            status: DocumentStatus.PENDING,
          }),
          ingestionId: newIngestion.id,
        });
      });

      it('should successfully reprocess document for admin', async () => {
        // Arrange
        const existingDocument = createMockDocument({
          uploadedBy: 'other-user-id',
        });
        const updatedDocument = createMockDocumentWithUploader({
          ...existingDocument,
          status: DocumentStatus.PENDING,
          fileSize: existingDocument.fileSize.toString(),
        });
        const newIngestion = { id: 'new-ingestion-id' };

        prismaService.document.findUnique.mockResolvedValue(existingDocument);
        prismaService.document.update.mockResolvedValue(
          updatedDocument as never,
        );
        prismaService.ingestion.create.mockResolvedValue(newIngestion as never);

        // Act
        const result = await service.reprocessDocument(
          mockDocumentId,
          mockAdminUserId,
          'admin',
        );

        // Assert
        expect(result.ingestionId).toBe(newIngestion.id);
      });

      it('should use document uploader as userId when userId is not provided', async () => {
        // Arrange
        const existingDocument = createMockDocument();
        const updatedDocument = createMockDocumentWithUploader({
          ...existingDocument,
          status: DocumentStatus.PENDING,
          fileSize: existingDocument.fileSize.toString(),
        });
        const newIngestion = { id: 'new-ingestion-id' };

        prismaService.document.findUnique.mockResolvedValue(existingDocument);
        prismaService.document.update.mockResolvedValue(
          updatedDocument as never,
        );
        prismaService.ingestion.create.mockResolvedValue(newIngestion as never);

        // Act
        await service.reprocessDocument(mockDocumentId, undefined, 'admin');

        // Assert
        expect(prismaService.ingestion.create).toHaveBeenCalledWith({
          data: {
            documentId: mockDocumentId,
            userId: existingDocument.uploadedBy,
            status: 'queued',
            progress: 0,
          },
        });
      });
    });

    describe('Negative Cases', () => {
      it('should throw NotFoundException when document does not exist', async () => {
        // Arrange
        prismaService.document.findUnique.mockResolvedValue(null);

        // Act & Assert
        await expect(
          service.reprocessDocument(mockDocumentId, mockUserId, 'editor'),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw ForbiddenException when non-admin user tries to reprocess other user document', async () => {
        // Arrange
        const otherUserDocument = createMockDocument({
          uploadedBy: 'other-user-id',
        });
        prismaService.document.findUnique.mockResolvedValue(otherUserDocument);

        // Act & Assert
        await expect(
          service.reprocessDocument(mockDocumentId, mockUserId, 'editor'),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should throw BadRequestException when document update fails', async () => {
        // Arrange
        const existingDocument = createMockDocument();
        const updateError = new Error('Document update failed');

        prismaService.document.findUnique.mockResolvedValue(existingDocument);
        prismaService.document.update.mockRejectedValue(updateError);

        // Act & Assert
        await expect(
          service.reprocessDocument(mockDocumentId, mockUserId, 'editor'),
        ).rejects.toThrow(BadRequestException);

        expect(loggerService.error).toHaveBeenCalledWith(
          `Failed to reprocess document: ${updateError.message}`,
          updateError.stack,
        );
      });

      it('should throw BadRequestException when ingestion creation fails', async () => {
        // Arrange
        const existingDocument = createMockDocument();
        const updatedDocument = createMockDocumentWithUploader({
          ...existingDocument,
          status: DocumentStatus.PENDING,
          fileSize: existingDocument.fileSize.toString(),
        });
        const ingestionError = new Error('Ingestion creation failed');

        prismaService.document.findUnique.mockResolvedValue(existingDocument);
        prismaService.document.update.mockResolvedValue(
          updatedDocument as never,
        );
        prismaService.ingestion.create.mockRejectedValue(ingestionError);

        // Act & Assert
        await expect(
          service.reprocessDocument(mockDocumentId, mockUserId, 'editor'),
        ).rejects.toThrow(BadRequestException);

        expect(loggerService.error).toHaveBeenCalledWith(
          `Failed to reprocess document: ${ingestionError.message}`,
          ingestionError.stack,
        );
      });
    });
  });

  describe('getDocumentStats (private method)', () => {
    describe('Positive Cases', () => {
      it('should calculate document statistics correctly', async () => {
        // Arrange
        const mockAggregateResult = {
          _count: { id: 10 },
          _sum: { fileSize: BigInt(10240000) },
        };

        const mockGroupByResult = [
          { status: DocumentStatus.PROCESSED, _count: { status: 5 } },
          { status: DocumentStatus.PENDING, _count: { status: 3 } },
          { status: DocumentStatus.FAILED, _count: { status: 2 } },
        ];

        prismaService.document.aggregate.mockResolvedValue(
          mockAggregateResult as never,
        );
        prismaService.document.groupBy.mockResolvedValue(
          mockGroupByResult as never,
        );

        const whereClause: Prisma.DocumentWhereInput = {
          status: DocumentStatus.PROCESSED,
        };

        // Act
        const result = await service['getDocumentStats'](whereClause);

        // Assert
        expect(prismaService.document.aggregate).toHaveBeenCalledWith({
          where: whereClause,
          _count: { id: true },
          _sum: { fileSize: true },
        });

        expect(prismaService.document.groupBy).toHaveBeenCalledWith({
          by: ['status'],
          where: whereClause,
          _count: { status: true },
        });

        expect(result).toEqual({
          total: 10,
          processed: 5,
          pending: 3,
          failed: 2,
          totalSize: 10240000,
        });
      });

      it('should handle zero file size correctly', async () => {
        // Arrange
        const mockAggregateResult = {
          _count: { id: 5 },
          _sum: { fileSize: null },
        };

        const mockGroupByResult = [
          { status: DocumentStatus.PENDING, _count: { status: 5 } },
        ];

        prismaService.document.aggregate.mockResolvedValue(
          mockAggregateResult as never,
        );
        prismaService.document.groupBy.mockResolvedValue(
          mockGroupByResult as never,
        );

        // Act
        const result = await service['getDocumentStats']({});

        // Assert
        expect(result).toEqual({
          total: 5,
          processed: 0,
          pending: 5,
          failed: 0,
          totalSize: 0,
        });
      });

      it('should handle empty status groups correctly', async () => {
        // Arrange
        const mockAggregateResult = {
          _count: { id: 0 },
          _sum: { fileSize: BigInt(0) },
        };

        const mockGroupByResult: never[] = [];

        prismaService.document.aggregate.mockResolvedValue(
          mockAggregateResult as never,
        );
        prismaService.document.groupBy.mockResolvedValue(mockGroupByResult);

        // Act
        const result = await service['getDocumentStats']({});

        // Assert
        expect(result).toEqual({
          total: 0,
          processed: 0,
          pending: 0,
          failed: 0,
          totalSize: 0,
        });
      });
    });

    describe('Negative Cases', () => {
      it('should handle database errors in aggregate query', async () => {
        // Arrange
        const dbError = new Error('Database aggregate failed');
        prismaService.document.aggregate.mockRejectedValue(dbError);

        // Act & Assert
        await expect(service['getDocumentStats']({})).rejects.toThrow(dbError);
      });

      it('should handle database errors in groupBy query', async () => {
        // Arrange
        const mockAggregateResult = {
          _count: { id: 10 },
          _sum: { fileSize: BigInt(10240000) },
        };
        const dbError = new Error('Database groupBy failed');

        prismaService.document.aggregate.mockResolvedValue(
          mockAggregateResult as never,
        );
        prismaService.document.groupBy.mockRejectedValue(dbError);

        // Act & Assert
        await expect(service['getDocumentStats']({})).rejects.toThrow(dbError);
      });
    });
  });
});
