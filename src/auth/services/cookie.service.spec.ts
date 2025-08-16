import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { CookieService } from './cookie.service';
import { AppConfigService } from '../../config/app-config.service';

describe('CookieService', () => {
  let service: CookieService;
  let configService: DeepMockProxy<AppConfigService>;
  let mockResponse: DeepMockProxy<Response>;

  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CookieService,
        {
          provide: AppConfigService,
          useValue: mockDeep<AppConfigService>(),
        },
      ],
    }).compile();

    service = module.get<CookieService>(CookieService);
    configService = module.get(AppConfigService);
    mockResponse = mockDeep<Response>();
  });

  afterEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('setRefreshTokenCookie', () => {
    const refreshToken = 'test-refresh-token-123';

    describe('Positive Cases', () => {
      it('should set refresh token cookie with correct options in development', () => {
        // Arrange
        process.env.NODE_ENV = 'development';

        // Act
        service.setRefreshTokenCookie(mockResponse, refreshToken);

        // Assert
        expect(mockResponse.cookie).toHaveBeenCalledWith(
          'refresh_token',
          refreshToken,
          {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/',
          },
        );
      });

      it('should set refresh token cookie with secure options in production', () => {
        // Arrange
        process.env.NODE_ENV = 'production';

        // Act
        service.setRefreshTokenCookie(mockResponse, refreshToken);

        // Assert
        expect(mockResponse.cookie).toHaveBeenCalledWith(
          'refresh_token',
          refreshToken,
          {
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/',
          },
        );
      });

      it('should set refresh token cookie with test environment settings', () => {
        // Arrange
        process.env.NODE_ENV = 'test';

        // Act
        service.setRefreshTokenCookie(mockResponse, refreshToken);

        // Assert
        expect(mockResponse.cookie).toHaveBeenCalledWith(
          'refresh_token',
          refreshToken,
          {
            httpOnly: true,
            secure: false,
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            path: '/',
          },
        );
      });

      it('should handle empty refresh token', () => {
        // Arrange
        const emptyToken = '';

        // Act
        service.setRefreshTokenCookie(mockResponse, emptyToken);

        // Assert
        expect(mockResponse.cookie).toHaveBeenCalledWith(
          'refresh_token',
          emptyToken,
          expect.any(Object),
        );
      });

      it('should handle long refresh token', () => {
        // Arrange
        const longToken = 'a'.repeat(1000);

        // Act
        service.setRefreshTokenCookie(mockResponse, longToken);

        // Assert
        expect(mockResponse.cookie).toHaveBeenCalledWith(
          'refresh_token',
          longToken,
          expect.any(Object),
        );
      });
    });

    describe('Cookie Options Validation', () => {
      it('should set httpOnly to true for security', () => {
        // Act
        service.setRefreshTokenCookie(mockResponse, refreshToken);

        // Assert
        const cookieOptions = (mockResponse.cookie as jest.Mock).mock
          .calls[0][2];
        expect(cookieOptions.httpOnly).toBe(true);
      });

      it('should set correct maxAge (7 days in milliseconds)', () => {
        // Act
        service.setRefreshTokenCookie(mockResponse, refreshToken);

        // Assert
        const cookieOptions = (mockResponse.cookie as jest.Mock).mock
          .calls[0][2];
        const expectedMaxAge = 7 * 24 * 60 * 60 * 1000;
        expect(cookieOptions.maxAge).toBe(expectedMaxAge);
      });

      it('should set path to root', () => {
        // Act
        service.setRefreshTokenCookie(mockResponse, refreshToken);

        // Assert
        const cookieOptions = (mockResponse.cookie as jest.Mock).mock
          .calls[0][2];
        expect(cookieOptions.path).toBe('/');
      });
    });
  });

  describe('clearRefreshTokenCookie', () => {
    describe('Positive Cases', () => {
      it('should clear refresh token cookie with correct options in development', () => {
        // Arrange
        process.env.NODE_ENV = 'development';

        // Act
        service.clearRefreshTokenCookie(mockResponse);

        // Assert
        expect(mockResponse.clearCookie).toHaveBeenCalledWith('refresh_token', {
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
        });
      });

      it('should clear refresh token cookie with secure options in production', () => {
        // Arrange
        process.env.NODE_ENV = 'production';

        // Act
        service.clearRefreshTokenCookie(mockResponse);

        // Assert
        expect(mockResponse.clearCookie).toHaveBeenCalledWith('refresh_token', {
          httpOnly: true,
          secure: true,
          sameSite: 'strict',
          path: '/',
        });
      });

      it('should clear refresh token cookie in test environment', () => {
        // Arrange
        process.env.NODE_ENV = 'test';

        // Act
        service.clearRefreshTokenCookie(mockResponse);

        // Assert
        expect(mockResponse.clearCookie).toHaveBeenCalledWith('refresh_token', {
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          path: '/',
        });
      });

      it('should call clearCookie only once', () => {
        // Act
        service.clearRefreshTokenCookie(mockResponse);

        // Assert
        expect(mockResponse.clearCookie).toHaveBeenCalledTimes(1);
      });
    });

    describe('Cookie Clear Options Validation', () => {
      it('should use same httpOnly setting as set operation', () => {
        // Act
        service.clearRefreshTokenCookie(mockResponse);

        // Assert
        const clearOptions = (mockResponse.clearCookie as jest.Mock).mock
          .calls[0][1];
        expect(clearOptions.httpOnly).toBe(true);
      });

      it('should use same path setting as set operation', () => {
        // Act
        service.clearRefreshTokenCookie(mockResponse);

        // Assert
        const clearOptions = (mockResponse.clearCookie as jest.Mock).mock
          .calls[0][1];
        expect(clearOptions.path).toBe('/');
      });

      it('should match secure setting based on environment', () => {
        // Arrange
        process.env.NODE_ENV = 'production';

        // Act
        service.clearRefreshTokenCookie(mockResponse);

        // Assert
        const clearOptions = (mockResponse.clearCookie as jest.Mock).mock
          .calls[0][1];
        expect(clearOptions.secure).toBe(true);
      });

      it('should match sameSite setting based on environment', () => {
        // Arrange
        process.env.NODE_ENV = 'production';

        // Act
        service.clearRefreshTokenCookie(mockResponse);

        // Assert
        const clearOptions = (mockResponse.clearCookie as jest.Mock).mock
          .calls[0][1];
        expect(clearOptions.sameSite).toBe('strict');
      });
    });
  });

  describe('Environment-based Configuration', () => {
    const testCases = [
      {
        env: 'development',
        expectedSecure: false,
        expectedSameSite: 'lax',
      },
      {
        env: 'test',
        expectedSecure: false,
        expectedSameSite: 'lax',
      },
      {
        env: 'production',
        expectedSecure: true,
        expectedSameSite: 'strict',
      },
      {
        env: 'staging',
        expectedSecure: false,
        expectedSameSite: 'lax',
      },
    ];

    testCases.forEach(({ env, expectedSecure, expectedSameSite }) => {
      it(`should use correct security settings for ${env} environment`, () => {
        // Arrange
        process.env.NODE_ENV = env;

        // Act
        service.setRefreshTokenCookie(mockResponse, 'test-token');

        // Assert
        const cookieOptions = (mockResponse.cookie as jest.Mock).mock
          .calls[0][2];
        expect(cookieOptions.secure).toBe(expectedSecure);
        expect(cookieOptions.sameSite).toBe(expectedSameSite);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle response object without cookie method gracefully', () => {
      // Arrange
      const invalidResponse = {} as Response;

      // Act & Assert
      expect(() => {
        service.setRefreshTokenCookie(invalidResponse, 'test-token');
      }).toThrow();
    });

    it('should handle response object without clearCookie method gracefully', () => {
      // Arrange
      const invalidResponse = {} as Response;

      // Act & Assert
      expect(() => {
        service.clearRefreshTokenCookie(invalidResponse);
      }).toThrow();
    });
  });

  describe('Logging', () => {
    it('should log when setting refresh token cookie', () => {
      // Arrange
      const loggerSpy = jest.spyOn(service['logger'], 'debug');

      // Act
      service.setRefreshTokenCookie(mockResponse, 'test-token');

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith('Setting refresh token cookie');
    });

    it('should log when clearing refresh token cookie', () => {
      // Arrange
      const loggerSpy = jest.spyOn(service['logger'], 'debug');

      // Act
      service.clearRefreshTokenCookie(mockResponse);

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith('Clearing refresh token cookie');
    });
  });
});
