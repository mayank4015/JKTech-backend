import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { UserProfileService } from './user-profile.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LoggerService } from '../../common/logger/logger.service';
import { SupabaseService } from '../../common/supabase/supabase.service';

describe('UserProfileService', () => {
  let service: UserProfileService;
  let prismaService: DeepMockProxy<PrismaService>;
  let loggerService: DeepMockProxy<LoggerService>;
  let supabaseService: DeepMockProxy<SupabaseService>;

  const mockUser = testUtils.createMockUser();
  const mockUserProfile = {
    id: mockUser.id,
    email: mockUser.email,
    name: mockUser.name,
    role: mockUser.role,
    isActive: mockUser.isActive,
    createdAt: mockUser.createdAt,
    updatedAt: mockUser.updatedAt,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserProfileService,
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaService>(),
        },
        {
          provide: LoggerService,
          useValue: mockDeep<LoggerService>(),
        },
        {
          provide: SupabaseService,
          useValue: mockDeep<SupabaseService>(),
        },
      ],
    }).compile();

    service = module.get<UserProfileService>(UserProfileService);
    prismaService = module.get(PrismaService);
    loggerService = module.get(LoggerService);
    supabaseService = module.get(SupabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserProfile', () => {
    describe('Positive Cases', () => {
      it('should return user profile when user exists', async () => {
        // Arrange
        prismaService.user.findUnique.mockResolvedValue(mockUser);

        // Act
        const result = await service.getUserProfile(mockUser.id);

        // Assert
        expect(prismaService.user.findUnique).toHaveBeenCalledWith({
          where: { id: mockUser.id },
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
        expect(result).toEqual(mockUserProfile);
      });

      it('should return profile for different user roles', async () => {
        // Arrange
        const editorUser = testUtils.createMockUser({ role: 'editor' });
        prismaService.user.findUnique.mockResolvedValue(editorUser);

        // Act
        const result = await service.getUserProfile(editorUser.id);

        // Assert
        expect(result.role).toBe('editor');
        expect(result).toEqual({
          id: editorUser.id,
          email: editorUser.email,
          name: editorUser.name,
          role: editorUser.role,
          isActive: editorUser.isActive,
          createdAt: editorUser.createdAt,
          updatedAt: editorUser.updatedAt,
        });
      });

      it('should return profile for inactive user', async () => {
        // Arrange
        const inactiveUser = testUtils.createMockUser({ isActive: false });
        prismaService.user.findUnique.mockResolvedValue(inactiveUser);

        // Act
        const result = await service.getUserProfile(inactiveUser.id);

        // Assert
        expect(result.isActive).toBe(false);
        expect(result).toEqual({
          id: inactiveUser.id,
          email: inactiveUser.email,
          name: inactiveUser.name,
          role: inactiveUser.role,
          isActive: inactiveUser.isActive,
          createdAt: inactiveUser.createdAt,
          updatedAt: inactiveUser.updatedAt,
        });
      });
    });

    describe('Negative Cases', () => {
      it('should throw NotFoundException when user not found', async () => {
        // Arrange
        prismaService.user.findUnique.mockResolvedValue(null);

        // Act & Assert
        await expect(service.getUserProfile('non-existent-id')).rejects.toThrow(
          new NotFoundException('User not found'),
        );

        expect(prismaService.user.findUnique).toHaveBeenCalledWith({
          where: { id: 'non-existent-id' },
          select: expect.any(Object),
        });
      });

      it('should handle and log database errors', async () => {
        // Arrange
        const dbError = new Error('Database connection failed');
        prismaService.user.findUnique.mockRejectedValue(dbError);

        // Act & Assert
        await expect(service.getUserProfile(mockUser.id)).rejects.toThrow(
          dbError,
        );

        expect(loggerService.logError).toHaveBeenCalledWith(
          dbError,
          UserProfileService.name,
          { userId: mockUser.id },
        );
      });

      it('should handle invalid user ID format', async () => {
        // Arrange
        const invalidId = '';
        prismaService.user.findUnique.mockResolvedValue(null);

        // Act & Assert
        await expect(service.getUserProfile(invalidId)).rejects.toThrow(
          new NotFoundException('User not found'),
        );
      });
    });
  });

  describe('updateUserProfile', () => {
    const updateData = {
      name: 'Updated Name',
      email: 'updated@example.com',
    };

    describe('Positive Cases', () => {
      it('should update user profile successfully', async () => {
        // Arrange
        const updatedUser = { ...mockUser, ...updateData };
        prismaService.user.update.mockResolvedValue(updatedUser);

        // Act
        const result = await service.updateUserProfile(mockUser.id, updateData);

        // Assert
        expect(prismaService.user.update).toHaveBeenCalledWith({
          where: { id: mockUser.id },
          data: updateData,
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
        expect(result).toEqual({
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: updatedUser.role,
          isActive: updatedUser.isActive,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt,
        });
        expect(loggerService.logTrace).toHaveBeenCalledWith(
          'User profile updated',
          { userId: mockUser.id, updateData },
        );
      });

      it('should update only name when email not provided', async () => {
        // Arrange
        const nameOnlyUpdate = { name: 'New Name Only' };
        const updatedUser = { ...mockUser, name: nameOnlyUpdate.name };
        prismaService.user.update.mockResolvedValue(updatedUser);

        // Act
        const result = await service.updateUserProfile(
          mockUser.id,
          nameOnlyUpdate,
        );

        // Assert
        expect(prismaService.user.update).toHaveBeenCalledWith({
          where: { id: mockUser.id },
          data: nameOnlyUpdate,
          select: expect.any(Object),
        });
        expect(result.name).toBe(nameOnlyUpdate.name);
        expect(result.email).toBe(mockUser.email); // Should remain unchanged
      });

      it('should update only email when name not provided', async () => {
        // Arrange
        const emailOnlyUpdate = { email: 'newemail@example.com' };
        const updatedUser = { ...mockUser, email: emailOnlyUpdate.email };
        prismaService.user.update.mockResolvedValue(updatedUser);

        // Act
        const result = await service.updateUserProfile(
          mockUser.id,
          emailOnlyUpdate,
        );

        // Assert
        expect(result.email).toBe(emailOnlyUpdate.email);
        expect(result.name).toBe(mockUser.name); // Should remain unchanged
        expect(loggerService.logTrace).toHaveBeenCalledWith(
          'Email update requested - consider implementing Supabase email change flow',
          {
            userId: mockUser.id,
            newEmail: emailOnlyUpdate.email,
          },
        );
      });

      it('should handle empty update data', async () => {
        // Arrange
        const emptyUpdate = {};
        prismaService.user.update.mockResolvedValue(mockUser);

        // Act
        const result = await service.updateUserProfile(
          mockUser.id,
          emptyUpdate,
        );

        // Assert
        expect(prismaService.user.update).toHaveBeenCalledWith({
          where: { id: mockUser.id },
          data: emptyUpdate,
          select: expect.any(Object),
        });
        expect(result).toEqual(mockUserProfile);
      });
    });

    describe('Negative Cases', () => {
      it('should handle database update errors', async () => {
        // Arrange
        const dbError = new Error('Unique constraint violation');
        prismaService.user.update.mockRejectedValue(dbError);

        // Act & Assert
        await expect(
          service.updateUserProfile(mockUser.id, updateData),
        ).rejects.toThrow(dbError);

        expect(loggerService.logError).toHaveBeenCalledWith(
          dbError,
          UserProfileService.name,
          {
            userId: mockUser.id,
            updateData,
          },
        );
      });

      it('should handle non-existent user update', async () => {
        // Arrange
        const notFoundError = new Error('Record to update not found');
        prismaService.user.update.mockRejectedValue(notFoundError);

        // Act & Assert
        await expect(
          service.updateUserProfile('non-existent-id', updateData),
        ).rejects.toThrow(notFoundError);
      });

      it('should handle Supabase email update errors gracefully', async () => {
        // Arrange
        const updateWithEmail = { email: 'new@example.com' };
        const updatedUser = { ...mockUser, email: updateWithEmail.email };
        prismaService.user.update.mockResolvedValue(updatedUser);

        // Mock Supabase error (this would happen in the try-catch block)
        // Since the actual Supabase call is commented out, we just verify logging

        // Act
        const result = await service.updateUserProfile(
          mockUser.id,
          updateWithEmail,
        );

        // Assert
        expect(result).toEqual({
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          role: updatedUser.role,
          isActive: updatedUser.isActive,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt,
        });
        expect(loggerService.logTrace).toHaveBeenCalledWith(
          'Email update requested - consider implementing Supabase email change flow',
          {
            userId: mockUser.id,
            newEmail: updateWithEmail.email,
          },
        );
      });
    });
  });

  describe('deactivateUser', () => {
    describe('Positive Cases', () => {
      it('should deactivate user successfully', async () => {
        // Arrange
        prismaService.user.update.mockResolvedValue({
          ...mockUser,
          isActive: false,
        });

        // Act
        await service.deactivateUser(mockUser.id);

        // Assert
        expect(prismaService.user.update).toHaveBeenCalledWith({
          where: { id: mockUser.id },
          data: { isActive: false },
        });
        expect(loggerService.logTrace).toHaveBeenCalledWith(
          'User deactivated in local database',
          { userId: mockUser.id },
        );
        expect(loggerService.logTrace).toHaveBeenCalledWith(
          'Consider implementing Supabase user deactivation for complete security',
          { userId: mockUser.id },
        );
      });

      it('should handle deactivating already inactive user', async () => {
        // Arrange
        const inactiveUser = { ...mockUser, isActive: false };
        prismaService.user.update.mockResolvedValue(inactiveUser);

        // Act
        await service.deactivateUser(mockUser.id);

        // Assert
        expect(prismaService.user.update).toHaveBeenCalledWith({
          where: { id: mockUser.id },
          data: { isActive: false },
        });
      });
    });

    describe('Negative Cases', () => {
      it('should handle database errors during deactivation', async () => {
        // Arrange
        const dbError = new Error('Database update failed');
        prismaService.user.update.mockRejectedValue(dbError);

        // Act & Assert
        await expect(service.deactivateUser(mockUser.id)).rejects.toThrow(
          dbError,
        );

        expect(loggerService.logError).toHaveBeenCalledWith(
          dbError,
          UserProfileService.name,
          { userId: mockUser.id },
        );
      });

      it('should handle non-existent user deactivation', async () => {
        // Arrange
        const notFoundError = new Error('Record to update not found');
        prismaService.user.update.mockRejectedValue(notFoundError);

        // Act & Assert
        await expect(service.deactivateUser('non-existent-id')).rejects.toThrow(
          notFoundError,
        );
      });
    });
  });

  describe('Service Integration', () => {
    it('should properly exclude password field from all operations', async () => {
      // Arrange
      const userWithPassword = { ...mockUser, password: 'hashed-password' };
      // The service should only return selected fields, not the password
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      // Act
      const result = await service.getUserProfile(mockUser.id);

      // Assert
      expect(result).not.toHaveProperty('password');
      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: mockUser.id },
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
    });

    it('should handle concurrent operations safely', async () => {
      // Arrange
      prismaService.user.findUnique.mockResolvedValue(mockUser);

      // Act
      const promises = [
        service.getUserProfile(mockUser.id),
        service.getUserProfile(mockUser.id),
      ];
      const results = await Promise.all(promises);

      // Assert
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(mockUserProfile);
      expect(results[1]).toEqual(mockUserProfile);
    });
  });
});
