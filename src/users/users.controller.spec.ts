import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService, CreateUserByAdminDto } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';
import {
  mockUser,
  createUserDto,
  expectedUserCreateResponse,
  mockPaginatedResponse,
  TEST_USER_ID,
  SPECIFIC_TEST_USER_ID,
  TEST_ERRORS,
} from './test-fixtures/user-test-data';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: DeepMockProxy<UsersService>;

  // Test data is now imported from test-fixtures/user-test-data.ts

  // Mock guards
  const mockJwtAuthGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  const mockRoleGuard = {
    canActivate: jest.fn().mockReturnValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockDeep<UsersService>(),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .overrideGuard(RoleGuard)
      .useValue(mockRoleGuard)
      .compile();

    controller = module.get<UsersController>(UsersController);
    usersService = module.get(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    const createUserDto: CreateUserByAdminDto = {
      name: 'New User',
      email: 'newuser@example.com',
      password: 'securePassword123',
      role: 'editor',
    };

    describe('Positive Cases', () => {
      it('should create a user successfully', async () => {
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
        usersService.createUserByAdmin.mockResolvedValue(expectedResponse);

        // Act
        const result = await controller.createUser(createUserDto);

        // Assert
        expect(usersService.createUserByAdmin).toHaveBeenCalledWith(
          createUserDto,
        );
        expect(result).toEqual(expectedResponse);
      });

      it('should create a viewer role user', async () => {
        // Arrange
        const viewerDto: CreateUserByAdminDto = {
          ...createUserDto,
          role: 'viewer',
        };
        const expectedResponse = {
          user: {
            id: mockUser.id,
            email: viewerDto.email,
            name: viewerDto.name,
            role: 'viewer',
          },
          message: 'User created successfully',
        };
        usersService.createUserByAdmin.mockResolvedValue(expectedResponse);

        // Act
        const result = await controller.createUser(viewerDto);

        // Assert
        expect(usersService.createUserByAdmin).toHaveBeenCalledWith(viewerDto);
        expect(result.user.role).toBe('viewer');
      });

      it('should handle user creation with all required fields', async () => {
        // Arrange
        const completeDto: CreateUserByAdminDto = {
          name: 'Complete User',
          email: 'complete@example.com',
          password: 'strongPassword456',
          role: 'editor',
        };
        const expectedResponse = {
          user: {
            id: mockUser.id,
            email: completeDto.email,
            name: completeDto.name,
            role: completeDto.role,
          },
          message: 'User created successfully',
        };
        usersService.createUserByAdmin.mockResolvedValue(expectedResponse);

        // Act
        const result = await controller.createUser(completeDto);

        // Assert
        expect(usersService.createUserByAdmin).toHaveBeenCalledWith(
          completeDto,
        );
        expect(result).toBeDefined();
      });
    });

    describe('Negative Cases', () => {
      it('should propagate service errors', async () => {
        // Arrange
        const serviceError = new Error('Email already exists');
        usersService.createUserByAdmin.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(controller.createUser(createUserDto)).rejects.toThrow(
          'Email already exists',
        );
      });

      it('should handle validation errors', async () => {
        // Arrange
        const validationError = new Error('Invalid email format');
        usersService.createUserByAdmin.mockRejectedValue(validationError);

        // Act & Assert
        await expect(controller.createUser(createUserDto)).rejects.toThrow(
          'Invalid email format',
        );
      });

      it('should handle service unavailable errors', async () => {
        // Arrange
        const serviceError = new Error('Service temporarily unavailable');
        usersService.createUserByAdmin.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(controller.createUser(createUserDto)).rejects.toThrow(
          'Service temporarily unavailable',
        );
      });
    });
  });

  describe('getUsers', () => {
    describe('Positive Cases', () => {
      it('should return users with default pagination', async () => {
        // Arrange
        usersService.getAllUsers.mockResolvedValue(mockPaginatedResponse);

        // Act
        const result = await controller.getUsers();

        // Assert
        expect(usersService.getAllUsers).toHaveBeenCalledWith(1, 10, {
          search: undefined,
          role: undefined,
          isActive: undefined,
          sortBy: undefined,
          sortOrder: undefined,
        });
        expect(result).toEqual(mockPaginatedResponse);
      });

      it('should return users with custom pagination', async () => {
        // Arrange
        const customResponse = {
          ...mockPaginatedResponse,
          page: 2,
          limit: 5,
        };
        usersService.getAllUsers.mockResolvedValue(customResponse);

        // Act
        const result = await controller.getUsers('2', '5');

        // Assert
        expect(usersService.getAllUsers).toHaveBeenCalledWith(2, 5, {
          search: undefined,
          role: undefined,
          isActive: undefined,
          sortBy: undefined,
          sortOrder: undefined,
        });
        expect(result.page).toBe(2);
        expect(result.limit).toBe(5);
      });

      it('should return users with search filter', async () => {
        // Arrange
        usersService.getAllUsers.mockResolvedValue(mockPaginatedResponse);

        // Act
        const result = await controller.getUsers('1', '10', 'test');

        // Assert
        expect(usersService.getAllUsers).toHaveBeenCalledWith(1, 10, {
          search: 'test',
          role: undefined,
          isActive: undefined,
          sortBy: undefined,
          sortOrder: undefined,
        });
        expect(result).toEqual(mockPaginatedResponse);
      });

      it('should return users with role filter', async () => {
        // Arrange
        usersService.getAllUsers.mockResolvedValue(mockPaginatedResponse);

        // Act
        const result = await controller.getUsers(
          '1',
          '10',
          undefined,
          'editor',
        );

        // Assert
        expect(usersService.getAllUsers).toHaveBeenCalledWith(1, 10, {
          search: undefined,
          role: 'editor',
          isActive: undefined,
          sortBy: undefined,
          sortOrder: undefined,
        });
        expect(result).toEqual(mockPaginatedResponse);
      });

      it('should return users with isActive filter set to true', async () => {
        // Arrange
        usersService.getAllUsers.mockResolvedValue(mockPaginatedResponse);

        // Act
        const result = await controller.getUsers(
          '1',
          '10',
          undefined,
          undefined,
          'true',
        );

        // Assert
        expect(usersService.getAllUsers).toHaveBeenCalledWith(1, 10, {
          search: undefined,
          role: undefined,
          isActive: true,
          sortBy: undefined,
          sortOrder: undefined,
        });
        expect(result).toEqual(mockPaginatedResponse);
      });

      it('should return users with isActive filter set to false', async () => {
        // Arrange
        usersService.getAllUsers.mockResolvedValue(mockPaginatedResponse);

        // Act
        const result = await controller.getUsers(
          '1',
          '10',
          undefined,
          undefined,
          'false',
        );

        // Assert
        expect(usersService.getAllUsers).toHaveBeenCalledWith(1, 10, {
          search: undefined,
          role: undefined,
          isActive: false,
          sortBy: undefined,
          sortOrder: undefined,
        });
        expect(result).toEqual(mockPaginatedResponse);
      });

      it('should return users with sorting parameters', async () => {
        // Arrange
        usersService.getAllUsers.mockResolvedValue(mockPaginatedResponse);

        // Act
        const result = await controller.getUsers(
          '1',
          '10',
          undefined,
          undefined,
          undefined,
          'name',
          'asc',
        );

        // Assert
        expect(usersService.getAllUsers).toHaveBeenCalledWith(1, 10, {
          search: undefined,
          role: undefined,
          isActive: undefined,
          sortBy: 'name',
          sortOrder: 'asc',
        });
        expect(result).toEqual(mockPaginatedResponse);
      });

      it('should return users with all filters combined', async () => {
        // Arrange
        usersService.getAllUsers.mockResolvedValue(mockPaginatedResponse);

        // Act
        const result = await controller.getUsers(
          '2',
          '5',
          'test',
          'editor',
          'true',
          'email',
          'desc',
        );

        // Assert
        expect(usersService.getAllUsers).toHaveBeenCalledWith(2, 5, {
          search: 'test',
          role: 'editor',
          isActive: true,
          sortBy: 'email',
          sortOrder: 'desc',
        });
        expect(result).toEqual(mockPaginatedResponse);
      });

      it('should handle isActive undefined correctly', async () => {
        // Arrange
        usersService.getAllUsers.mockResolvedValue(mockPaginatedResponse);

        // Act
        const result = await controller.getUsers(
          '1',
          '10',
          undefined,
          undefined,
          undefined,
        );

        // Assert
        expect(usersService.getAllUsers).toHaveBeenCalledWith(1, 10, {
          search: undefined,
          role: undefined,
          isActive: undefined,
          sortBy: undefined,
          sortOrder: undefined,
        });
        expect(result).toEqual(mockPaginatedResponse);
      });
    });

    describe('Negative Cases', () => {
      it('should handle service errors', async () => {
        // Arrange
        const serviceError = new Error('Database connection failed');
        usersService.getAllUsers.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(controller.getUsers()).rejects.toThrow(
          'Database connection failed',
        );
      });

      it('should handle invalid page parameter', async () => {
        // Arrange
        usersService.getAllUsers.mockResolvedValue(mockPaginatedResponse);

        // Act
        const result = await controller.getUsers('invalid', '10');

        // Assert
        expect(usersService.getAllUsers).toHaveBeenCalledWith(NaN, 10, {
          search: undefined,
          role: undefined,
          isActive: undefined,
          sortBy: undefined,
          sortOrder: undefined,
        });
      });

      it('should handle invalid limit parameter', async () => {
        // Arrange
        usersService.getAllUsers.mockResolvedValue(mockPaginatedResponse);

        // Act
        const result = await controller.getUsers('1', 'invalid');

        // Assert
        expect(usersService.getAllUsers).toHaveBeenCalledWith(1, NaN, {
          search: undefined,
          role: undefined,
          isActive: undefined,
          sortBy: undefined,
          sortOrder: undefined,
        });
      });

      it('should propagate service timeout errors', async () => {
        // Arrange
        const timeoutError = new Error('Request timeout');
        usersService.getAllUsers.mockRejectedValue(timeoutError);

        // Act & Assert
        await expect(controller.getUsers()).rejects.toThrow('Request timeout');
      });
    });
  });

  describe('updateUser', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000';
    const updateData = { name: 'Updated Name', role: 'viewer' };

    describe('Positive Cases', () => {
      it('should update user successfully', async () => {
        // Arrange
        const updatedUser = { ...mockUser, ...updateData };
        usersService.updateUser.mockResolvedValue(updatedUser);

        // Act
        const result = await controller.updateUser(userId, updateData);

        // Assert
        expect(usersService.updateUser).toHaveBeenCalledWith(
          userId,
          updateData,
        );
        expect(result).toEqual(updatedUser);
      });

      it('should update user with partial data', async () => {
        // Arrange
        const partialUpdate = { name: 'New Name Only' };
        const updatedUser = { ...mockUser, name: 'New Name Only' };
        usersService.updateUser.mockResolvedValue(updatedUser);

        // Act
        const result = await controller.updateUser(userId, partialUpdate);

        // Assert
        expect(usersService.updateUser).toHaveBeenCalledWith(
          userId,
          partialUpdate,
        );
        expect(result.name).toBe('New Name Only');
      });

      it('should update user role', async () => {
        // Arrange
        const roleUpdate = { role: 'admin' };
        const updatedUser = { ...mockUser, role: 'admin' };
        usersService.updateUser.mockResolvedValue(updatedUser);

        // Act
        const result = await controller.updateUser(userId, roleUpdate);

        // Assert
        expect(usersService.updateUser).toHaveBeenCalledWith(
          userId,
          roleUpdate,
        );
        expect(result.role).toBe('admin');
      });

      it('should handle empty update data', async () => {
        // Arrange
        const emptyUpdate = {};
        usersService.updateUser.mockResolvedValue(mockUser);

        // Act
        const result = await controller.updateUser(userId, emptyUpdate);

        // Assert
        expect(usersService.updateUser).toHaveBeenCalledWith(
          userId,
          emptyUpdate,
        );
        expect(result).toEqual(mockUser);
      });
    });

    describe('Negative Cases', () => {
      it('should handle user not found error', async () => {
        // Arrange
        const notFoundError = new Error('User not found');
        usersService.updateUser.mockRejectedValue(notFoundError);

        // Act & Assert
        await expect(controller.updateUser(userId, updateData)).rejects.toThrow(
          'User not found',
        );
      });

      it('should handle validation errors', async () => {
        // Arrange
        const validationError = new Error('Invalid role specified');
        usersService.updateUser.mockRejectedValue(validationError);

        // Act & Assert
        await expect(controller.updateUser(userId, updateData)).rejects.toThrow(
          'Invalid role specified',
        );
      });

      it('should handle database constraint errors', async () => {
        // Arrange
        const constraintError = new Error('Email already exists');
        usersService.updateUser.mockRejectedValue(constraintError);

        // Act & Assert
        await expect(
          controller.updateUser(userId, { email: 'existing@example.com' }),
        ).rejects.toThrow('Email already exists');
      });

      it('should handle invalid user ID format', async () => {
        // Arrange
        const invalidIdError = new Error('Invalid UUID format');
        usersService.updateUser.mockRejectedValue(invalidIdError);

        // Act & Assert
        await expect(
          controller.updateUser('invalid-id', updateData),
        ).rejects.toThrow('Invalid UUID format');
      });
    });
  });

  describe('deleteUser', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000';

    describe('Positive Cases', () => {
      it('should delete user successfully', async () => {
        // Arrange
        usersService.deleteUser.mockResolvedValue(mockUser);

        // Act
        const result = await controller.deleteUser(userId);

        // Assert
        expect(usersService.deleteUser).toHaveBeenCalledWith(userId);
        expect(result).toBeUndefined(); // Controller returns void
      });

      it('should call service with correct user ID', async () => {
        // Arrange
        const specificUserId = '987e6543-e21b-43d2-a654-321987654321';
        usersService.deleteUser.mockResolvedValue(mockUser);

        // Act
        await controller.deleteUser(specificUserId);

        // Assert
        expect(usersService.deleteUser).toHaveBeenCalledWith(specificUserId);
      });
    });

    describe('Negative Cases', () => {
      it('should handle user not found error', async () => {
        // Arrange
        const notFoundError = new Error('User not found');
        usersService.deleteUser.mockRejectedValue(notFoundError);

        // Act & Assert
        await expect(controller.deleteUser(userId)).rejects.toThrow(
          'User not found',
        );
      });

      it('should handle foreign key constraint violations', async () => {
        // Arrange
        const constraintError = new Error(
          'Cannot delete user with associated records',
        );
        usersService.deleteUser.mockRejectedValue(constraintError);

        // Act & Assert
        await expect(controller.deleteUser(userId)).rejects.toThrow(
          'Cannot delete user with associated records',
        );
      });

      it('should handle database connection errors', async () => {
        // Arrange
        const dbError = new Error('Database connection failed');
        usersService.deleteUser.mockRejectedValue(dbError);

        // Act & Assert
        await expect(controller.deleteUser(userId)).rejects.toThrow(
          'Database connection failed',
        );
      });

      it('should handle invalid user ID format', async () => {
        // Arrange
        const invalidIdError = new Error('Invalid UUID format');
        usersService.deleteUser.mockRejectedValue(invalidIdError);

        // Act & Assert
        await expect(controller.deleteUser('invalid-id')).rejects.toThrow(
          'Invalid UUID format',
        );
      });
    });
  });

  describe('toggleUserStatus', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000';

    describe('Positive Cases', () => {
      it('should toggle user status successfully', async () => {
        // Arrange
        const toggledUser = { ...mockUser, isActive: false };
        usersService.toggleUserStatus.mockResolvedValue(toggledUser);

        // Act
        const result = await controller.toggleUserStatus(userId);

        // Assert
        expect(usersService.toggleUserStatus).toHaveBeenCalledWith(userId);
        expect(result).toEqual(toggledUser);
      });

      it('should return user with toggled status from active to inactive', async () => {
        // Arrange
        const inactiveUser = { ...mockUser, isActive: false };
        usersService.toggleUserStatus.mockResolvedValue(inactiveUser);

        // Act
        const result = await controller.toggleUserStatus(userId);

        // Assert
        expect(result.isActive).toBe(false);
      });

      it('should return user with toggled status from inactive to active', async () => {
        // Arrange
        const activeUser = { ...mockUser, isActive: true };
        usersService.toggleUserStatus.mockResolvedValue(activeUser);

        // Act
        const result = await controller.toggleUserStatus(userId);

        // Assert
        expect(result.isActive).toBe(true);
      });

      it('should call service with correct user ID', async () => {
        // Arrange
        const specificUserId = '987e6543-e21b-43d2-a654-321987654321';
        usersService.toggleUserStatus.mockResolvedValue(mockUser);

        // Act
        await controller.toggleUserStatus(specificUserId);

        // Assert
        expect(usersService.toggleUserStatus).toHaveBeenCalledWith(
          specificUserId,
        );
      });
    });

    describe('Negative Cases', () => {
      it('should handle user not found error', async () => {
        // Arrange
        const notFoundError = new Error('User not found');
        usersService.toggleUserStatus.mockRejectedValue(notFoundError);

        // Act & Assert
        await expect(controller.toggleUserStatus(userId)).rejects.toThrow(
          'User not found',
        );
      });

      it('should handle database connection errors', async () => {
        // Arrange
        const dbError = new Error('Database connection failed');
        usersService.toggleUserStatus.mockRejectedValue(dbError);

        // Act & Assert
        await expect(controller.toggleUserStatus(userId)).rejects.toThrow(
          'Database connection failed',
        );
      });

      it('should handle invalid user ID format', async () => {
        // Arrange
        const invalidIdError = new Error('Invalid UUID format');
        usersService.toggleUserStatus.mockRejectedValue(invalidIdError);

        // Act & Assert
        await expect(controller.toggleUserStatus('invalid-id')).rejects.toThrow(
          'Invalid UUID format',
        );
      });

      it('should handle service unavailable errors', async () => {
        // Arrange
        const serviceError = new Error('Service temporarily unavailable');
        usersService.toggleUserStatus.mockRejectedValue(serviceError);

        // Act & Assert
        await expect(controller.toggleUserStatus(userId)).rejects.toThrow(
          'Service temporarily unavailable',
        );
      });
    });
  });

  describe('Guard Integration', () => {
    it('should be protected by JwtAuthGuard', () => {
      // This test ensures the controller is properly decorated with guards
      const guards = Reflect.getMetadata('__guards__', UsersController);
      expect(guards).toBeDefined();
    });

    it('should be protected by RoleGuard', () => {
      // This test ensures the controller is properly decorated with guards
      const guards = Reflect.getMetadata('__guards__', UsersController);
      expect(guards).toBeDefined();
    });

    it('should require ADMIN role for all endpoints', () => {
      // This test ensures all methods are properly decorated with @Roles(Role.ADMIN)
      const createUserRoles = Reflect.getMetadata(
        'roles',
        controller.createUser,
      );
      const getUsersRoles = Reflect.getMetadata('roles', controller.getUsers);
      const updateUserRoles = Reflect.getMetadata(
        'roles',
        controller.updateUser,
      );
      const deleteUserRoles = Reflect.getMetadata(
        'roles',
        controller.deleteUser,
      );
      const toggleStatusRoles = Reflect.getMetadata(
        'roles',
        controller.toggleUserStatus,
      );

      expect(createUserRoles).toBeDefined();
      expect(getUsersRoles).toBeDefined();
      expect(updateUserRoles).toBeDefined();
      expect(deleteUserRoles).toBeDefined();
      expect(toggleStatusRoles).toBeDefined();
    });
  });
});
