import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { ResponseSanitizerInterceptor } from '../response-sanitizer.interceptor';

describe('ResponseSanitizerInterceptor', () => {
  let interceptor: ResponseSanitizerInterceptor;
  let mockExecutionContext: jest.Mocked<ExecutionContext>;
  let mockCallHandler: jest.Mocked<CallHandler>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ResponseSanitizerInterceptor],
    }).compile();

    interceptor = module.get<ResponseSanitizerInterceptor>(
      ResponseSanitizerInterceptor,
    );

    mockExecutionContext = {
      getClass: jest.fn().mockReturnValue({ name: 'TestController' }),
      getHandler: jest.fn().mockReturnValue({ name: 'testMethod' }),
    } as any;

    mockCallHandler = {
      handle: jest.fn(),
    } as any;
  });

  describe('intercept', () => {
    it('should remove sensitive fields from response', (done) => {
      const responseData = {
        id: 1,
        username: 'testuser',
        password: 'secret123',
        refreshToken: 'token123',
        email: 'test@example.com',
      };

      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result.id).toBe(1);
          expect(result.username).toBe('testuser');
          expect(result.email).toBe('test@example.com');
          expect(result.password).toBeUndefined();
          expect(result.refreshToken).toBeUndefined();
          done();
        });
    });

    it('should handle nested objects', (done) => {
      const responseData = {
        user: {
          id: 1,
          username: 'testuser',
          password: 'secret123',
          profile: {
            name: 'Test User',
            otp: '123456',
          },
        },
        metadata: {
          accessToken: 'token123',
          timestamp: new Date(),
        },
      };

      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result.user.id).toBe(1);
          expect(result.user.username).toBe('testuser');
          expect(result.user.profile.name).toBe('Test User');
          expect(result.user.password).toBeUndefined();
          expect(result.user.profile.otp).toBeUndefined();
          expect(result.metadata.accessToken).toBeUndefined();
          expect(result.metadata.timestamp).toBeDefined();
          done();
        });
    });

    it('should handle arrays correctly', (done) => {
      const responseData = {
        users: [
          {
            id: 1,
            username: 'user1',
            password: 'secret1',
          },
          {
            id: 2,
            username: 'user2',
            passwordHash: 'hash2',
          },
        ],
      };

      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result.users).toHaveLength(2);
          expect(result.users[0].id).toBe(1);
          expect(result.users[0].username).toBe('user1');
          expect(result.users[0].password).toBeUndefined();
          expect(result.users[1].id).toBe(2);
          expect(result.users[1].username).toBe('user2');
          expect(result.users[1].passwordHash).toBeUndefined();
          done();
        });
    });

    it('should preserve primitive values', (done) => {
      const responseData = {
        count: 42,
        active: true,
        price: 19.99,
        name: 'Test Product',
        date: new Date('2023-01-01'),
        nullValue: null,
        undefinedValue: undefined,
      };

      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result.count).toBe(42);
          expect(result.active).toBe(true);
          expect(result.price).toBe(19.99);
          expect(result.name).toBe('Test Product');
          expect(result.date).toEqual(new Date('2023-01-01'));
          expect(result.nullValue).toBe(null);
          expect(result.undefinedValue).toBe(undefined);
          done();
        });
    });

    it('should handle null and undefined responses', (done) => {
      mockCallHandler.handle.mockReturnValue(of(null));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toBe(null);
          done();
        });
    });

    it('should handle primitive response types', (done) => {
      mockCallHandler.handle.mockReturnValue(of('simple string response'));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toBe('simple string response');
          done();
        });
    });

    it('should handle circular references safely', (done) => {
      const responseData: any = {
        id: 1,
        name: 'Test',
      };
      responseData.self = responseData; // Create circular reference

      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result.id).toBe(1);
          expect(result.name).toBe('Test');
          expect(result.self).toBe('[Circular Reference]');
          done();
        });
    });

    it('should handle sanitization errors gracefully', (done) => {
      const responseData = { test: 'data' };

      // Mock a scenario where sanitization might fail
      const originalSanitizeResponse = (interceptor as any).sanitizeResponse;
      (interceptor as any).sanitizeResponse = jest
        .fn()
        .mockImplementation(() => {
          throw new Error('Sanitization failed');
        });

      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result).toBe(responseData); // Should return original data on error
          done();
        });
    });

    it('should be case-insensitive for field matching', (done) => {
      const responseData = {
        id: 1,
        PASSWORD: 'secret123', // Uppercase
        RefreshToken: 'token123', // Mixed case
        username: 'testuser',
      };

      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result.id).toBe(1);
          expect(result.username).toBe('testuser');
          expect(result.PASSWORD).toBeUndefined();
          expect(result.RefreshToken).toBeUndefined();
          done();
        });
    });

    it('should handle deeply nested structures', (done) => {
      const responseData = {
        level1: {
          level2: {
            level3: {
              password: 'deep-secret',
              data: 'safe-data',
            },
          },
        },
      };

      mockCallHandler.handle.mockReturnValue(of(responseData));

      interceptor
        .intercept(mockExecutionContext, mockCallHandler)
        .subscribe((result) => {
          expect(result.level1.level2.level3.data).toBe('safe-data');
          expect(result.level1.level2.level3.password).toBeUndefined();
          done();
        });
    });
  });

  describe('getRedactedFields', () => {
    it('should return list of redacted fields', () => {
      const fields = interceptor.getRedactedFields();

      expect(Array.isArray(fields)).toBe(true);
      expect(fields).toContain('password');
      expect(fields).toContain('refreshtoken');
      expect(fields).toContain('otp');
    });
  });
});
