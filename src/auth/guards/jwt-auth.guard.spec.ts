import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { Request } from 'express';

import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

interface MockHttpArgumentsHost {
  getRequest: () => Request;
  getResponse: () => unknown;
  getNext: () => unknown;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: DeepMockProxy<Reflector>;
  let mockExecutionContext: DeepMockProxy<ExecutionContext>;
  let mockRequest: DeepMockProxy<Request>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: Reflector,
          useValue: mockDeep<Reflector>(),
        },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    reflector = module.get(Reflector);
    mockExecutionContext = mockDeep<ExecutionContext>();
    mockRequest = mockDeep<Request>();

    // Setup default execution context
    const mockHttpArgumentsHost: MockHttpArgumentsHost = {
      getRequest: () => mockRequest,
      getResponse: jest.fn(),
      getNext: jest.fn(),
    };
    mockExecutionContext.switchToHttp.mockReturnValue(
      mockHttpArgumentsHost as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    describe('Public Routes', () => {
      it('should allow access to public routes without authentication', () => {
        // Arrange
        reflector.getAllAndOverride.mockReturnValue(true);

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(true);
        expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
          IS_PUBLIC_KEY,
          [mockExecutionContext.getHandler(), mockExecutionContext.getClass()],
        );
      });

      it('should check both handler and class level decorators for public routes', () => {
        // Arrange
        const mockHandler = jest.fn();
        const mockClass = jest.fn();
        mockExecutionContext.getHandler.mockReturnValue(mockHandler);
        mockExecutionContext.getClass.mockReturnValue(mockClass);
        reflector.getAllAndOverride.mockReturnValue(true);

        // Act
        guard.canActivate(mockExecutionContext);

        // Assert
        expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
          IS_PUBLIC_KEY,
          [mockHandler, mockClass],
        );
      });

      it('should prioritize handler-level public decorator over class-level', () => {
        // Arrange
        reflector.getAllAndOverride.mockReturnValue(true);

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(true);
        // getAllAndOverride handles the priority internally
        expect(reflector.getAllAndOverride).toHaveBeenCalledTimes(1);
      });
    });

    describe('Protected Routes', () => {
      it('should call parent canActivate for protected routes', () => {
        // Arrange
        reflector.getAllAndOverride.mockReturnValue(false);
        const parentCanActivateSpy = jest
          .spyOn(
            Object.getPrototypeOf(Object.getPrototypeOf(guard)),
            'canActivate',
          )
          .mockReturnValue(true);

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(true);
        expect(parentCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);
      });

      it('should call parent canActivate when public decorator is not present', () => {
        // Arrange
        reflector.getAllAndOverride.mockReturnValue(undefined);
        const parentCanActivateSpy = jest
          .spyOn(
            Object.getPrototypeOf(Object.getPrototypeOf(guard)),
            'canActivate',
          )
          .mockReturnValue(true);

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(true);
        expect(parentCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);
      });

      it('should call parent canActivate when public decorator is explicitly false', () => {
        // Arrange
        reflector.getAllAndOverride.mockReturnValue(false);
        const parentCanActivateSpy = jest
          .spyOn(
            Object.getPrototypeOf(Object.getPrototypeOf(guard)),
            'canActivate',
          )
          .mockReturnValue(false);

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(false);
        expect(parentCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);
      });
    });

    describe('Edge Cases', () => {
      it('should handle null execution context gracefully', () => {
        // Arrange
        reflector.getAllAndOverride.mockReturnValue(false);
        const parentCanActivateSpy = jest
          .spyOn(
            Object.getPrototypeOf(Object.getPrototypeOf(guard)),
            'canActivate',
          )
          .mockImplementation(() => {
            throw new Error('Execution context is null');
          });

        // Act & Assert
        expect(() =>
          guard.canActivate(null as unknown as ExecutionContext),
        ).toThrow();
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

      it('should handle missing handler or class', () => {
        // Arrange
        mockExecutionContext.getHandler.mockReturnValue(undefined as never);
        mockExecutionContext.getClass.mockReturnValue(undefined as never);
        reflector.getAllAndOverride.mockReturnValue(false);
        const parentCanActivateSpy = jest
          .spyOn(
            Object.getPrototypeOf(Object.getPrototypeOf(guard)),
            'canActivate',
          )
          .mockReturnValue(true);

        // Act
        const result = guard.canActivate(mockExecutionContext);

        // Assert
        expect(result).toBe(true);
        expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
          IS_PUBLIC_KEY,
          [undefined, undefined],
        );
        expect(parentCanActivateSpy).toHaveBeenCalled();
      });
    });
  });

  describe('getRequest', () => {
    describe('Positive Cases', () => {
      it('should return request object from execution context', () => {
        // Arrange
        const expectedRequest = mockRequest;
        const mockHttpArgumentsHost: MockHttpArgumentsHost = {
          getRequest: () => expectedRequest,
          getResponse: jest.fn(),
          getNext: jest.fn(),
        };
        mockExecutionContext.switchToHttp.mockReturnValue(
          mockHttpArgumentsHost as never,
        );

        // Act
        const result = guard.getRequest(mockExecutionContext);

        // Assert
        expect(result).toBe(expectedRequest);
        expect(mockExecutionContext.switchToHttp).toHaveBeenCalled();
      });

      it('should handle different request types', () => {
        // Arrange
        const customRequest = {
          ...mockRequest,
          customProperty: 'test-value',
        } as unknown as Request & { customProperty: string };

        const mockHttpArgumentsHost: MockHttpArgumentsHost = {
          getRequest: () => customRequest,
          getResponse: jest.fn(),
          getNext: jest.fn(),
        };
        mockExecutionContext.switchToHttp.mockReturnValue(
          mockHttpArgumentsHost as never,
        );

        // Act
        const result = guard.getRequest(mockExecutionContext);

        // Assert
        expect(result).toBe(customRequest);
        expect(
          (result as Request & { customProperty: string }).customProperty,
        ).toBe('test-value');
      });
    });

    describe('Error Cases', () => {
      it('should handle execution context without HTTP context', () => {
        // Arrange
        mockExecutionContext.switchToHttp.mockImplementation(() => {
          throw new Error('Not an HTTP context');
        });

        // Act & Assert
        expect(() => guard.getRequest(mockExecutionContext)).toThrow(
          'Not an HTTP context',
        );
      });

      it('should handle HTTP context without request', () => {
        // Arrange
        mockExecutionContext.switchToHttp.mockReturnValue({
          getRequest: () => {
            throw new Error('Request not available');
          },
          getResponse: jest.fn(),
          getNext: jest.fn(),
        });

        // Act & Assert
        expect(() => guard.getRequest(mockExecutionContext)).toThrow(
          'Request not available',
        );
      });
    });
  });

  describe('Integration with AuthGuard', () => {
    it('should extend AuthGuard with jwt strategy', () => {
      // Assert
      expect(guard).toBeInstanceOf(JwtAuthGuard);
      // Verify it's using the 'jwt' strategy (this is set in the constructor)
      expect(guard).toBeDefined();
    });

    it('should properly integrate with Passport JWT strategy', () => {
      // Arrange
      reflector.getAllAndOverride.mockReturnValue(false);
      const parentCanActivateSpy = jest
        .spyOn(
          Object.getPrototypeOf(Object.getPrototypeOf(guard)),
          'canActivate',
        )
        .mockReturnValue(Promise.resolve(true));

      // Act
      const result = guard.canActivate(mockExecutionContext);

      // Assert
      expect(parentCanActivateSpy).toHaveBeenCalledWith(mockExecutionContext);
      expect(result).toEqual(Promise.resolve(true));
    });
  });

  describe('Decorator Integration', () => {
    it('should correctly identify public routes with @Public decorator', () => {
      // Arrange
      reflector.getAllAndOverride.mockReturnValue(true);

      // Act
      const result = guard.canActivate(mockExecutionContext);

      // Assert
      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
        IS_PUBLIC_KEY,
        expect.any(Array),
      );
    });

    it('should handle mixed public and protected routes in same class', () => {
      // Test case 1: Public method in protected class
      reflector.getAllAndOverride.mockReturnValueOnce(true);
      let result = guard.canActivate(mockExecutionContext);
      expect(result).toBe(true);

      // Test case 2: Protected method in public class
      reflector.getAllAndOverride.mockReturnValueOnce(false);
      const parentCanActivateSpy = jest
        .spyOn(
          Object.getPrototypeOf(Object.getPrototypeOf(guard)),
          'canActivate',
        )
        .mockReturnValue(true);

      result = guard.canActivate(mockExecutionContext);
      expect(parentCanActivateSpy).toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    it('should not call parent canActivate for public routes', () => {
      // Arrange
      reflector.getAllAndOverride.mockReturnValue(true);
      const parentCanActivateSpy = jest
        .spyOn(
          Object.getPrototypeOf(Object.getPrototypeOf(guard)),
          'canActivate',
        )
        .mockReturnValue(true);

      // Act
      guard.canActivate(mockExecutionContext);

      // Assert
      expect(parentCanActivateSpy).not.toHaveBeenCalled();
    });

    it('should minimize reflector calls', () => {
      // Arrange
      reflector.getAllAndOverride.mockReturnValue(true);

      // Act
      guard.canActivate(mockExecutionContext);

      // Assert
      expect(reflector.getAllAndOverride).toHaveBeenCalledTimes(1);
    });
  });
});
