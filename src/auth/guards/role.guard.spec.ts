import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { Request } from 'express';

import { RoleGuard } from './role.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Role } from '../types/role.types';

interface MockHttpArgumentsHost {
  getRequest: () => RequestWithUser;
  getResponse: () => unknown;
  getNext: () => unknown;
}

// Define user type
interface MockUser {
  id: string;
  email: string;
  name: string;
  role: string | undefined;
  isActive: boolean;
}

// Define request with user type
interface RequestWithUser {
  user?: MockUser | null;
}

describe('RoleGuard', () => {
  let guard: RoleGuard;
  let reflector: DeepMockProxy<Reflector>;
  let mockExecutionContext: DeepMockProxy<ExecutionContext>;
  let mockRequest: DeepMockProxy<RequestWithUser>;

  const createMockUser = (overrides: Partial<MockUser> = {}): MockUser => ({
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    isActive: true,
    ...overrides,
  });

  const mockUser = createMockUser();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleGuard,
        {
          provide: Reflector,
          useValue: mockDeep<Reflector>(),
        },
      ],
    }).compile();

    guard = module.get<RoleGuard>(RoleGuard);
    reflector = module.get(Reflector);
    mockExecutionContext = mockDeep<ExecutionContext>();
    mockRequest = mockDeep<RequestWithUser>();

    // Setup default execution context
    const mockHttpArgumentsHost: MockHttpArgumentsHost = {
      getRequest: () => mockRequest,
      getResponse: jest.fn(),
      getNext: jest.fn(),
    };
    mockExecutionContext.switchToHttp.mockReturnValue(
      mockHttpArgumentsHost as never,
    );

    // Setup default user in request
    mockRequest.user = mockUser;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    describe('Public Routes', () => {
      it('should allow access to public routes regardless of role', () => {
        // Arrange
        reflector.getAllAndOverride
          .mockReturnValueOnce(true) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['admin']); // ROLES_KEY (shouldn't be checked)

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(true);
        expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
          IS_PUBLIC_KEY,
          [mockExecutionContext.getHandler(), mockExecutionContext.getClass()],
        );
        expect(reflector.getAllAndOverride).toHaveBeenCalledTimes(1);
      });

      it('should prioritize public decorator over role requirements', () => {
        // Arrange
        mockRequest.user = undefined; // No user
        reflector.getAllAndOverride
          .mockReturnValueOnce(true) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['admin']); // ROLES_KEY

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(true);
      });
    });

    describe('Routes Without Role Requirements', () => {
      it('should allow access when no roles are required', () => {
        // Arrange
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(undefined); // ROLES_KEY - no roles required

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(true);
        expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
          mockExecutionContext.getHandler(),
          mockExecutionContext.getClass(),
        ]);
      });

      it('should deny access when roles array is empty but user exists', () => {
        // Arrange
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce([]); // ROLES_KEY - empty array

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(false); // Empty array means no roles match
      });
    });

    describe('Role-Based Access Control', () => {
      it('should allow access when user has required role', () => {
        // Arrange
        const adminUser = createMockUser({ role: 'admin' });
        mockRequest.user = adminUser;
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['admin']); // ROLES_KEY

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(true);
      });

      it('should allow access when user has one of multiple required roles', () => {
        // Arrange
        const editorUser = createMockUser({ role: 'editor' });
        mockRequest.user = editorUser;
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['admin', 'editor']); // ROLES_KEY

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(true);
      });

      it('should allow access for admin role when multiple roles required', () => {
        // Arrange
        const adminUser = createMockUser({ role: 'admin' });
        mockRequest.user = adminUser;
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['admin', 'editor', 'viewer']); // ROLES_KEY

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(true);
      });

      it('should allow access for viewer role when viewer is required', () => {
        // Arrange
        const viewerUser = createMockUser({ role: 'viewer' });
        mockRequest.user = viewerUser;
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['viewer']); // ROLES_KEY

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(true);
      });
    });

    describe('Access Denied Cases', () => {
      it('should deny access when user does not have required role', () => {
        // Arrange
        const viewerUser = createMockUser({ role: 'viewer' });
        mockRequest.user = viewerUser;
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['admin']); // ROLES_KEY

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(false);
      });

      it('should deny access when user has none of the required roles', () => {
        // Arrange
        const viewerUser = createMockUser({ role: 'viewer' });
        mockRequest.user = viewerUser;
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['admin', 'editor']); // ROLES_KEY

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(false);
      });

      it('should deny access when no user is present in request', () => {
        // Arrange
        mockRequest.user = undefined;
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['admin']); // ROLES_KEY

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(false);
      });

      it('should deny access when user is null', () => {
        // Arrange
        mockRequest.user = null;
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['admin']); // ROLES_KEY

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(false);
      });

      it('should deny access when user role is undefined', () => {
        // Arrange
        const userWithoutRole = { ...mockUser, role: undefined };
        mockRequest.user = userWithoutRole;
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['admin']); // ROLES_KEY

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(false);
      });

      it('should deny access when user role is empty string', () => {
        // Arrange
        const userWithEmptyRole = { ...mockUser, role: '' };
        mockRequest.user = userWithEmptyRole;
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['admin']); // ROLES_KEY

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(false);
      });
    });

    describe('Edge Cases', () => {
      it('should handle case-sensitive role comparison', () => {
        // Arrange
        const userWithUppercaseRole = { ...mockUser, role: 'ADMIN' };
        mockRequest.user = userWithUppercaseRole;
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['admin']); // ROLES_KEY

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(false); // Should be case-sensitive
      });

      it('should handle special characters in roles', () => {
        // Arrange
        const userWithSpecialRole = { ...mockUser, role: 'super-admin' };
        mockRequest.user = userWithSpecialRole;
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['super-admin']); // ROLES_KEY

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(true);
      });

      it('should handle numeric roles', () => {
        // Arrange
        const userWithNumericRole = { ...mockUser, role: '1' };
        mockRequest.user = userWithNumericRole;
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['1']); // ROLES_KEY

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(true);
      });

      it('should handle execution context errors gracefully', () => {
        // Arrange
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['admin']); // ROLES_KEY
        mockExecutionContext.switchToHttp.mockImplementation(() => {
          throw new Error('Context error');
        });

        // Act & Assert
        expect(() => guard.canActivate(mockExecutionContext)).toThrow(
          'Context error',
        );
      });

      it('should handle reflector errors gracefully', () => {
        // Arrange
        reflector.getAllAndOverride.mockImplementation(() => {
          throw new Error('Reflector error');
        });

        // Act & Assert
        expect(() => guard.canActivate(mockExecutionContext)).toThrow(
          'Reflector error',
        );
      });
    });

    describe('Decorator Priority', () => {
      it('should check public decorator before role decorator', () => {
        // Arrange
        reflector.getAllAndOverride
          .mockReturnValueOnce(true) // IS_PUBLIC_KEY
          .mockReturnValueOnce(['admin']); // ROLES_KEY

        // Act
        guard.canActivate(mockExecutionContext);

        // Assert
        expect(reflector.getAllAndOverride).toHaveBeenNthCalledWith(
          1,
          IS_PUBLIC_KEY,
          expect.any(Array),
        );
        expect(reflector.getAllAndOverride).toHaveBeenCalledTimes(1); // Should not check roles
      });

      it('should check both handler and class level decorators', () => {
        // Arrange
        const mockHandler = jest.fn();
        const mockClass = jest.fn();
        mockExecutionContext.getHandler.mockReturnValue(mockHandler);
        mockExecutionContext.getClass.mockReturnValue(mockClass);
        reflector.getAllAndOverride.mockReturnValue(false);

        // Act
        guard.canActivate(mockExecutionContext);

        // Assert
        expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
          IS_PUBLIC_KEY,
          [mockHandler, mockClass],
        );
        expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
          mockHandler,
          mockClass,
        ]);
      });
    });

    describe('Performance', () => {
      it('should short-circuit on public routes', () => {
        // Arrange
        reflector.getAllAndOverride.mockReturnValueOnce(true);

        // Act
        guard.canActivate(mockExecutionContext);

        // Assert
        expect(reflector.getAllAndOverride).toHaveBeenCalledTimes(1);
        expect(mockExecutionContext.switchToHttp).not.toHaveBeenCalled();
      });

      it('should short-circuit when no roles required', () => {
        // Arrange
        reflector.getAllAndOverride
          .mockReturnValueOnce(false) // IS_PUBLIC_KEY
          .mockReturnValueOnce(undefined); // ROLES_KEY

        // Act
        guard.canActivate(mockExecutionContext);

        // Assert
        expect(reflector.getAllAndOverride).toHaveBeenCalledTimes(2);
        expect(mockExecutionContext.switchToHttp).not.toHaveBeenCalled();
      });
    });
  });

  describe('Role Validation Logic', () => {
    it('should use Array.some for role matching', () => {
      // Arrange
      const roles = ['admin', 'editor', 'viewer'];
      const userRole = 'editor';
      mockRequest.user = { ...mockUser, role: userRole };
      reflector.getAllAndOverride
        .mockReturnValueOnce(false) // IS_PUBLIC_KEY
        .mockReturnValueOnce(roles); // ROLES_KEY

      // Act
      const result = guard.canActivate(mockExecutionContext);

      // Assert
      expect(result).toBe(true);
    });

    it('should handle single role requirement', () => {
      // Arrange
      const roles = ['admin'];
      mockRequest.user = { ...mockUser, role: 'admin' };
      reflector.getAllAndOverride
        .mockReturnValueOnce(false) // IS_PUBLIC_KEY
        .mockReturnValueOnce(roles); // ROLES_KEY

      // Act
      const result = guard.canActivate(mockExecutionContext);

      // Assert
      expect(result).toBe(true);
    });
  });
});
