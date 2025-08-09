import { Test, TestingModule } from '@nestjs/testing';
import { UsersService, CreateUserByAdminDto } from './users.service';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { User } from '@prisma/client';
import {
  mockUser,
  mockUsers,
  createUserDto,
  expectedUserCreateResponse,
  TEST_USER_ID,
} from './test-fixtures/user-test-data';

// Extend Jest matchers to handle Date checking with mocked constructors
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeDateLike(): R;
    }
  }
}

expect.extend({
  toBeDateLike(received: unknown) {
    const pass =
      received instanceof Date ||
      (received &&
        typeof received === 'object' &&
        typeof (received as any).getTime === 'function');

    if (pass) {
      return {
        message: () => `expected ${received} not to be Date-like`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be Date-like`,
        pass: false,
      };
    }
  },
});

describe('UsersService', () => {
  let service: UsersService;
  let authService: DeepMockProxy<AuthService>;
  let prismaService: DeepMockProxy<PrismaService>;
  let loggerService: DeepMockProxy<LoggerService>;
  let module: TestingModule;

  // Test data is now imported from test-fixtures/user-test-data.ts

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: AuthService,
          useValue: mockDeep<AuthService>(),
        },
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaService>(),
        },
        {
          provide: LoggerService,
          useValue: mockDeep<LoggerService>(),
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    authService = module.get(AuthService);
    prismaService = module.get(PrismaService);
    loggerService = module.get(LoggerService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await module.close();
  });

  describe('createUserByAdmin', () => {
    describe('Positive Cases', () => {
      it('should create a user successfully with valid data', async () => {
        // Arrange
        authService.createUser.mockResolvedValue(expectedUserCreateResponse);

        // Act
        const result = await service.createUserByAdmin(createUserDto);

        // Assert
        expect(loggerService.debug).toHaveBeenCalledWith(
          `Admin creating user: ${createUserDto.email}`,
        );
        expect(authService.createUser).toHaveBeenCalledWith(createUserDto, {
          generateTokens: false,
          createdByAdmin: true,
        });
        expect(result).toEqual(expectedUserCreateResponse);
      });

      it('should create a viewer role user successfully', async () => {
        // Arrange
        const viewerUserDto: CreateUserByAdminDto = {
          ...createUserDto,
          role: 'viewer',
        };
        const expectedResponse = {
          user: {
            id: mockUser.id,
            email: viewerUserDto.email,
            name: viewerUserDto.name,
            role: 'viewer',
          },
          message: 'User created successfully',
        };
        authService.createUser.mockResolvedValue(expectedResponse);

        // Act
        const result = await service.createUserByAdmin(viewerUserDto);

        // Assert
        expect(authService.createUser).toHaveBeenCalledWith(viewerUserDto, {
          generateTokens: false,
          createdByAdmin: true,
        });
        expect(result.user.role).toBe('viewer');
      });

      it('should log debug message with correct email', async () => {
        // Arrange
        const expectedResponse = {
          user: {
            id: mockUser.id,
            email: createUserDto.email,
            name: createUserDto.name,
            role: createUserDto.role,
          },
          message: 'User created successfully',
        };
        authService.createUser.mockResolvedValue(expectedResponse);

        // Act
        await service.createUserByAdmin(createUserDto);

        // Assert
        expect(loggerService.debug).toHaveBeenCalledWith(
          `Admin creating user: ${createUserDto.email}`,
        );
      });
    });

    describe('Negative Cases', () => {
      it('should throw error when auth service fails', async () => {
        // Arrange
        const error = new Error('Email already exists');
        authService.createUser.mockRejectedValue(error);

        // Act & Assert
        await expect(service.createUserByAdmin(createUserDto)).rejects.toThrow(
          'Email already exists',
        );
        expect(loggerService.debug).toHaveBeenCalledWith(
          `Admin creating user: ${createUserDto.email}`,
        );
      });

      it('should propagate validation errors from auth service', async () => {
        // Arrange
        const validationError = new Error('Invalid email format');
        authService.createUser.mockRejectedValue(validationError);

        // Act & Assert
        await expect(service.createUserByAdmin(createUserDto)).rejects.toThrow(
          'Invalid email format',
        );
      });
    });
  });

  describe('getAllUsers', () => {
    describe('Positive Cases', () => {
      it('should return paginated users with default parameters', async () => {
        // Arrange
        const expectedResult = {
          data: mockUsers,
          total: 2,
          page: 1,
          limit: 10,
          totalPages: 1,
        };

        prismaService.user.findMany.mockResolvedValue(mockUsers);
        prismaService.user.count.mockResolvedValue(2);

        // Act
        const result = await service.getAllUsers();

        // Assert
        expect(prismaService.user.findMany).toHaveBeenCalledWith({
          where: {},
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        expect(prismaService.user.count).toHaveBeenCalledWith({ where: {} });
        expect(result).toEqual(expectedResult);
      });

      it('should return users with custom pagination', async () => {
        // Arrange
        const page = 2;
        const limit = 5;
        prismaService.user.findMany.mockResolvedValue([mockUser]);
        prismaService.user.count.mockResolvedValue(10);

        // Act
        const result = await service.getAllUsers(page, limit);

        // Assert
        expect(prismaService.user.findMany).toHaveBeenCalledWith({
          where: {},
          skip: 5, // (page - 1) * limit
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: expect.objectContaining({
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          }),
        });
        expect(result.page).toBe(2);
        expect(result.limit).toBe(5);
        expect(result.totalPages).toBe(2);
      });

      it('should filter users by search term', async () => {
        // Arrange
        const filters = { search: 'test' };
        prismaService.user.findMany.mockResolvedValue([mockUser]);
        prismaService.user.count.mockResolvedValue(1);

        // Act
        await service.getAllUsers(1, 10, filters);

        // Assert
        expect(prismaService.user.findMany).toHaveBeenCalledWith({
          where: {
            OR: [
              { name: { contains: 'test', mode: 'insensitive' } },
              { email: { contains: 'test', mode: 'insensitive' } },
            ],
          },
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: expect.any(Object),
        });
      });

      it('should filter users by role', async () => {
        // Arrange
        const filters = { role: 'editor' };
        prismaService.user.findMany.mockResolvedValue([mockUser]);
        prismaService.user.count.mockResolvedValue(1);

        // Act
        await service.getAllUsers(1, 10, filters);

        // Assert
        expect(prismaService.user.findMany).toHaveBeenCalledWith({
          where: { role: 'editor' },
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: expect.any(Object),
        });
      });

      it('should filter users by active status', async () => {
        // Arrange
        const filters = { isActive: true };
        prismaService.user.findMany.mockResolvedValue([mockUser]);
        prismaService.user.count.mockResolvedValue(1);

        // Act
        await service.getAllUsers(1, 10, filters);

        // Assert
        expect(prismaService.user.findMany).toHaveBeenCalledWith({
          where: { isActive: true },
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: expect.any(Object),
        });
      });

      it('should apply custom sorting', async () => {
        // Arrange
        const filters = { sortBy: 'name', sortOrder: 'asc' as const };
        prismaService.user.findMany.mockResolvedValue(mockUsers);
        prismaService.user.count.mockResolvedValue(2);

        // Act
        await service.getAllUsers(1, 10, filters);

        // Assert
        expect(prismaService.user.findMany).toHaveBeenCalledWith({
          where: {},
          skip: 0,
          take: 10,
          orderBy: { name: 'asc' },
          select: expect.any(Object),
        });
      });

      it('should combine multiple filters', async () => {
        // Arrange
        const filters = {
          search: 'test',
          role: 'editor',
          isActive: true,
          sortBy: 'email',
          sortOrder: 'desc' as const,
        };
        prismaService.user.findMany.mockResolvedValue([mockUser]);
        prismaService.user.count.mockResolvedValue(1);

        // Act
        await service.getAllUsers(1, 10, filters);

        // Assert
        expect(prismaService.user.findMany).toHaveBeenCalledWith({
          where: {
            OR: [
              { name: { contains: 'test', mode: 'insensitive' } },
              { email: { contains: 'test', mode: 'insensitive' } },
            ],
            role: 'editor',
            isActive: true,
          },
          skip: 0,
          take: 10,
          orderBy: { email: 'desc' },
          select: expect.any(Object),
        });
      });

      it('should ignore role filter when set to "all"', async () => {
        // Arrange
        const filters = { role: 'all' };
        prismaService.user.findMany.mockResolvedValue(mockUsers);
        prismaService.user.count.mockResolvedValue(2);

        // Act
        await service.getAllUsers(1, 10, filters);

        // Assert
        expect(prismaService.user.findMany).toHaveBeenCalledWith({
          where: {},
          skip: 0,
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: expect.any(Object),
        });
      });
    });

    describe('Negative Cases', () => {
      it('should handle database connection error', async () => {
        // Arrange
        const dbError = new Error('Database connection failed');
        prismaService.user.findMany.mockRejectedValue(dbError);

        // Act & Assert
        await expect(service.getAllUsers()).rejects.toThrow(
          'Database connection failed',
        );
      });

      it('should handle count query failure', async () => {
        // Arrange
        prismaService.user.findMany.mockResolvedValue(mockUsers);
        prismaService.user.count.mockRejectedValue(new Error('Count failed'));

        // Act & Assert
        await expect(service.getAllUsers()).rejects.toThrow('Count failed');
      });

      it('should handle invalid page numbers gracefully', async () => {
        // Arrange
        prismaService.user.findMany.mockResolvedValue([]);
        prismaService.user.count.mockResolvedValue(0);

        // Act
        const result = await service.getAllUsers(0, 10); // Invalid page

        // Assert
        expect(prismaService.user.findMany).toHaveBeenCalledWith({
          where: {},
          skip: -10, // This would be handled by Prisma
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: expect.any(Object),
        });
        expect(result.page).toBe(0);
      });
    });
  });

  describe('updateUser', () => {
    const userId = TEST_USER_ID;
    const updateData = { name: 'Updated Name', role: 'viewer' as const };

    describe('Positive Cases', () => {
      it('should update user successfully', async () => {
        // Arrange
        const updatedUser = { ...mockUser, ...updateData };
        prismaService.user.update.mockResolvedValue(updatedUser);

        // Act
        const result = await service.updateUser(userId, updateData);

        // Assert
        expect(prismaService.user.update).toHaveBeenCalledTimes(1);
        const updateCall = prismaService.user.update.mock.calls[0][0];
        expect(updateCall.where).toEqual({ id: userId });
        expect(updateCall.data).toMatchObject(updateData);
        expect(updateCall.data.updatedAt).toBeDefined();
        expect(updateCall.data.updatedAt).toBeDateLike();
        expect(result).toEqual(updatedUser);
      });

      it('should update user with empty data object', async () => {
        // Arrange
        const emptyUpdate = {};
        prismaService.user.update.mockResolvedValue(mockUser);

        // Act
        const result = await service.updateUser(userId, emptyUpdate);

        // Assert
        expect(prismaService.user.update).toHaveBeenCalledTimes(1);
        const updateCall = prismaService.user.update.mock.calls[0][0];
        expect(updateCall.where).toEqual({ id: userId });
        expect(updateCall.data.updatedAt).toBeDefined();
        expect(updateCall.data.updatedAt).toBeDateLike();
        expect(result).toEqual(mockUser);
      });

      it('should preserve updatedAt timestamp', async () => {
        // Arrange
        const beforeUpdate = new Date();
        prismaService.user.update.mockResolvedValue(mockUser);

        // Act
        await service.updateUser(userId, updateData);

        // Assert
        const updateCall = prismaService.user.update.mock.calls[0][0];
        expect(updateCall.data.updatedAt).toBeDefined();
        expect(updateCall.data.updatedAt).toBeDateLike();
        expect(
          (updateCall.data.updatedAt as Date).getTime(),
        ).toBeGreaterThanOrEqual(beforeUpdate.getTime());
      });
    });

    describe('Negative Cases', () => {
      it('should throw error when user not found', async () => {
        // Arrange
        const notFoundError = new Error('User not found');
        prismaService.user.update.mockRejectedValue(notFoundError);

        // Act & Assert
        await expect(service.updateUser(userId, updateData)).rejects.toThrow(
          'User not found',
        );
      });

      it('should handle database constraint violations', async () => {
        // Arrange
        const constraintError = new Error('Unique constraint violation');
        prismaService.user.update.mockRejectedValue(constraintError);

        // Act & Assert
        await expect(service.updateUser(userId, updateData)).rejects.toThrow(
          'Unique constraint violation',
        );
      });

      it('should handle invalid user ID format', async () => {
        // Arrange
        const invalidIdError = new Error('Invalid UUID format');
        prismaService.user.update.mockRejectedValue(invalidIdError);

        // Act & Assert
        await expect(
          service.updateUser('invalid-id', updateData),
        ).rejects.toThrow('Invalid UUID format');
      });
    });
  });

  describe('deleteUser', () => {
    const userId = TEST_USER_ID;

    describe('Positive Cases', () => {
      it('should delete user successfully', async () => {
        // Arrange
        prismaService.user.delete.mockResolvedValue(mockUser);

        // Act
        const result = await service.deleteUser(userId);

        // Assert
        expect(prismaService.user.delete).toHaveBeenCalledWith({
          where: { id: userId },
        });
        expect(result).toEqual(mockUser);
      });
    });

    describe('Negative Cases', () => {
      it('should throw error when user not found', async () => {
        // Arrange
        const notFoundError = new Error('User not found');
        prismaService.user.delete.mockRejectedValue(notFoundError);

        // Act & Assert
        await expect(service.deleteUser(userId)).rejects.toThrow(
          'User not found',
        );
      });

      it('should handle foreign key constraint violations', async () => {
        // Arrange
        const constraintError = new Error('Foreign key constraint violation');
        prismaService.user.delete.mockRejectedValue(constraintError);

        // Act & Assert
        await expect(service.deleteUser(userId)).rejects.toThrow(
          'Foreign key constraint violation',
        );
      });

      it('should handle invalid user ID format', async () => {
        // Arrange
        const invalidIdError = new Error('Invalid UUID format');
        prismaService.user.delete.mockRejectedValue(invalidIdError);

        // Act & Assert
        await expect(service.deleteUser('invalid-id')).rejects.toThrow(
          'Invalid UUID format',
        );
      });
    });
  });

  describe('toggleUserStatus', () => {
    const userId = TEST_USER_ID;

    describe('Positive Cases', () => {
      it('should toggle active user to inactive', async () => {
        // Arrange
        const activeUser = { ...mockUser, isActive: true };
        const inactiveUser = { ...mockUser, isActive: false };

        prismaService.user.findUnique.mockResolvedValue(activeUser);
        prismaService.user.update.mockResolvedValue(inactiveUser);

        // Act
        const result = await service.toggleUserStatus(userId);

        // Assert
        expect(prismaService.user.findUnique).toHaveBeenCalledWith({
          where: { id: userId },
        });
        expect(prismaService.user.update).toHaveBeenCalledTimes(1);
        const updateCall = prismaService.user.update.mock.calls[0][0];
        expect(updateCall.where).toEqual({ id: userId });
        expect(updateCall.data.isActive).toBe(false);
        expect(updateCall.data.updatedAt).toBeDefined();
        expect(updateCall.data.updatedAt).toBeDateLike();
        expect(result).toEqual(inactiveUser);
      });

      it('should toggle inactive user to active', async () => {
        // Arrange
        const inactiveUser = { ...mockUser, isActive: false };
        const activeUser = { ...mockUser, isActive: true };

        prismaService.user.findUnique.mockResolvedValue(inactiveUser);
        prismaService.user.update.mockResolvedValue(activeUser);

        // Act
        const result = await service.toggleUserStatus(userId);

        // Assert
        expect(prismaService.user.update).toHaveBeenCalledTimes(1);
        const updateCall = prismaService.user.update.mock.calls[0][0];
        expect(updateCall.where).toEqual({ id: userId });
        expect(updateCall.data.isActive).toBe(true);
        expect(updateCall.data.updatedAt).toBeDefined();
        expect(updateCall.data.updatedAt).toBeDateLike();
        expect(result).toEqual(activeUser);
      });

      it('should update timestamp when toggling status', async () => {
        // Arrange
        const beforeToggle = new Date();
        prismaService.user.findUnique.mockResolvedValue(mockUser);
        prismaService.user.update.mockResolvedValue(mockUser);

        // Act
        await service.toggleUserStatus(userId);

        // Assert
        const updateCall = prismaService.user.update.mock.calls[0][0];
        expect(updateCall.data.updatedAt).toBeDefined();
        expect(updateCall.data.updatedAt).toBeDateLike();
        expect(
          (updateCall.data.updatedAt as Date).getTime(),
        ).toBeGreaterThanOrEqual(beforeToggle.getTime());
      });
    });

    describe('Negative Cases', () => {
      it('should throw error when user not found', async () => {
        // Arrange
        prismaService.user.findUnique.mockResolvedValue(null);

        // Act & Assert
        await expect(service.toggleUserStatus(userId)).rejects.toThrow(
          'User not found',
        );
        expect(prismaService.user.update).not.toHaveBeenCalled();
      });

      it('should handle database error during find operation', async () => {
        // Arrange
        const dbError = new Error('Database connection failed');
        prismaService.user.findUnique.mockRejectedValue(dbError);

        // Act & Assert
        await expect(service.toggleUserStatus(userId)).rejects.toThrow(
          'Database connection failed',
        );
      });

      it('should handle database error during update operation', async () => {
        // Arrange
        prismaService.user.findUnique.mockResolvedValue(mockUser);
        const updateError = new Error('Update failed');
        prismaService.user.update.mockRejectedValue(updateError);

        // Act & Assert
        await expect(service.toggleUserStatus(userId)).rejects.toThrow(
          'Update failed',
        );
      });

      it('should handle invalid user ID format', async () => {
        // Arrange
        const invalidIdError = new Error('Invalid UUID format');
        prismaService.user.findUnique.mockRejectedValue(invalidIdError);

        // Act & Assert
        await expect(service.toggleUserStatus('invalid-id')).rejects.toThrow(
          'Invalid UUID format',
        );
      });
    });
  });
});
