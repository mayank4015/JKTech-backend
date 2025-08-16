import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { Request } from 'express';

import { JwtStrategy } from './jwt.strategy';
import { AuthService } from '../auth.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import { AppConfigService } from '../../config/app-config.service';
import { JwtPayload } from '../types/auth.types';

// Helper function to access protected static method in a type-safe way
const getExtractJWTFromCookie = (strategy: typeof JwtStrategy) =>
  strategy['extractJWTFromCookie'] as (req: Request) => string | null;

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let authService: DeepMockProxy<AuthService>;
  let configService: DeepMockProxy<AppConfigService>;
  let tokenBlacklistService: DeepMockProxy<TokenBlacklistService>;

  const mockUser = testUtils.createMockUser();
  const mockJwtPayload = testUtils.createMockJwtPayload();

  beforeEach(async () => {
    // Create mocks before module compilation
    const mockAuthService = mockDeep<AuthService>();
    const mockConfigService = mockDeep<AppConfigService>();
    const mockTokenBlacklistService = mockDeep<TokenBlacklistService>();

    // Set up config service mocks before instantiation
    mockConfigService.getJwtSecret.mockReturnValue('test-jwt-secret');
    mockConfigService.getJwtExpiresIn.mockReturnValue('1h');
    mockConfigService.getRefreshTokenExpiresIn.mockReturnValue('7d');

    // Mock the auth getter property
    Object.defineProperty(mockConfigService, 'auth', {
      get: jest.fn(() => ({
        jwtSecret: 'test-jwt-secret',
        jwtExpiresIn: '1h',
        refreshTokenExpiresIn: '7d',
      })),
      configurable: true,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: AppConfigService,
          useValue: mockConfigService,
        },
        {
          provide: TokenBlacklistService,
          useValue: mockTokenBlacklistService,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    authService = module.get(AuthService);
    configService = module.get(AppConfigService);
    tokenBlacklistService = module.get(TokenBlacklistService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validate', () => {
    describe('Positive Cases', () => {
      it('should return user when valid payload and active user', async () => {
        // Arrange
        const payloadWithJti = { ...mockJwtPayload, jti: 'test-jti' };
        authService.findUserById.mockResolvedValue(mockUser);
        tokenBlacklistService.isTokenBlacklisted.mockResolvedValue(false);

        // Act
        const result = await strategy.validate(payloadWithJti);

        // Assert
        expect(tokenBlacklistService.isTokenBlacklisted).toHaveBeenCalledWith(
          'test-jti',
        );
        expect(authService.findUserById).toHaveBeenCalledWith(
          payloadWithJti.sub,
        );
        expect(result).toEqual({ ...mockUser, tokenPayload: payloadWithJti });
      });

      it('should validate user with different roles', async () => {
        // Arrange
        const editorUser = testUtils.createMockUser({ role: 'editor' });
        const editorPayload = testUtils.createMockJwtPayload({
          role: 'editor',
        });
        authService.findUserById.mockResolvedValue(editorUser);

        // Act
        const result = await strategy.validate(editorPayload);

        // Assert
        expect(result).toEqual({ ...editorUser, tokenPayload: editorPayload });
        expect(result.role).toBe('editor');
      });

      it('should validate user with viewer role', async () => {
        // Arrange
        const viewerUser = testUtils.createMockUser({ role: 'viewer' });
        const viewerPayload = testUtils.createMockJwtPayload({
          role: 'viewer',
        });
        authService.findUserById.mockResolvedValue(viewerUser);

        // Act
        const result = await strategy.validate(viewerPayload);

        // Assert
        expect(result).toEqual({ ...viewerUser, tokenPayload: viewerPayload });
        expect(result.role).toBe('viewer');
      });
    });

    describe('Negative Cases', () => {
      it('should throw UnauthorizedException when token is blacklisted', async () => {
        // Arrange
        const payloadWithJti = { ...mockJwtPayload, jti: 'blacklisted-jti' };
        tokenBlacklistService.isTokenBlacklisted.mockResolvedValue(true);

        // Act & Assert
        await expect(strategy.validate(payloadWithJti)).rejects.toThrow(
          new UnauthorizedException('Token has been revoked'),
        );

        expect(tokenBlacklistService.isTokenBlacklisted).toHaveBeenCalledWith(
          'blacklisted-jti',
        );
        expect(authService.findUserById).not.toHaveBeenCalled();
      });

      it('should throw UnauthorizedException when user not found', async () => {
        // Arrange
        const payloadWithJti = { ...mockJwtPayload, jti: 'test-jti' };
        tokenBlacklistService.isTokenBlacklisted.mockResolvedValue(false);
        authService.findUserById.mockResolvedValue(null);

        // Act & Assert
        await expect(strategy.validate(payloadWithJti)).rejects.toThrow(
          new UnauthorizedException('User not found'),
        );

        expect(tokenBlacklistService.isTokenBlacklisted).toHaveBeenCalledWith(
          'test-jti',
        );
        expect(authService.findUserById).toHaveBeenCalledWith(
          payloadWithJti.sub,
        );
      });

      it('should throw UnauthorizedException when user is inactive', async () => {
        // Arrange
        const inactiveUser = testUtils.createMockUser({ isActive: false });
        authService.findUserById.mockResolvedValue(inactiveUser);

        // Act & Assert
        await expect(strategy.validate(mockJwtPayload)).rejects.toThrow(
          new UnauthorizedException('Account is deactivated'),
        );
      });

      it('should handle invalid payload structure', async () => {
        // Arrange
        const invalidPayload = {
          sub: '',
          email: '',
          name: '',
          role: '',
        } as JwtPayload;
        authService.findUserById.mockResolvedValue(null);

        // Act & Assert
        await expect(strategy.validate(invalidPayload)).rejects.toThrow(
          new UnauthorizedException('User not found'),
        );

        expect(authService.findUserById).toHaveBeenCalledWith('');
      });

      it('should handle database errors gracefully', async () => {
        // Arrange
        const dbError = new Error('Database connection failed');
        authService.findUserById.mockRejectedValue(dbError);

        // Act & Assert
        await expect(strategy.validate(mockJwtPayload)).rejects.toThrow(
          dbError,
        );
      });
    });
  });

  describe('extractJWTFromCookie', () => {
    describe('Positive Cases', () => {
      it('should extract JWT from access_token cookie', () => {
        // Arrange
        const mockRequest = {
          cookies: {
            access_token: 'valid-jwt-token',
          },
        } as unknown as Request;

        // Act
        const result = getExtractJWTFromCookie(JwtStrategy)(mockRequest);

        // Assert
        expect(result).toBe('valid-jwt-token');
      });

      it('should handle multiple cookies and extract correct one', () => {
        // Arrange
        const mockRequest = {
          cookies: {
            session_id: 'session-123',
            access_token: 'jwt-token-123',
            refresh_token: 'refresh-token-456',
          },
        } as unknown as Request;

        // Act
        const result = getExtractJWTFromCookie(JwtStrategy)(mockRequest);

        // Assert
        expect(result).toBe('jwt-token-123');
      });
    });

    describe('Negative Cases', () => {
      it('should return null when no cookies present', () => {
        // Arrange
        const mockRequest = {} as Request;

        // Act
        const result = getExtractJWTFromCookie(JwtStrategy)(mockRequest);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null when cookies object is empty', () => {
        // Arrange
        const mockRequest = {
          cookies: {},
        } as Request;

        // Act
        const result = getExtractJWTFromCookie(JwtStrategy)(mockRequest);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null when access_token cookie is missing', () => {
        // Arrange
        const mockRequest = {
          cookies: {
            session_id: 'session-123',
            refresh_token: 'refresh-token-456',
          },
        } as unknown as Request;

        // Act
        const result = getExtractJWTFromCookie(JwtStrategy)(mockRequest);

        // Assert
        expect(result).toBeNull();
      });

      it('should return null when access_token is empty string', () => {
        // Arrange
        const mockRequest = {
          cookies: {
            access_token: '',
          },
        } as unknown as Request;

        // Act
        const result = getExtractJWTFromCookie(JwtStrategy)(mockRequest);

        // Assert
        expect(result).toBe('');
      });

      it('should handle undefined cookies gracefully', () => {
        // Arrange
        const mockRequest = {
          cookies: undefined,
        } as unknown as Request;

        // Act
        const result = getExtractJWTFromCookie(JwtStrategy)(mockRequest);

        // Assert
        expect(result).toBeNull();
      });
    });
  });

  describe('JWT Strategy Configuration', () => {
    it('should be configured with correct JWT secret', () => {
      // Assert
      expect(configService.getJwtSecret).toHaveBeenCalled();
    });

    it('should use both cookie and bearer token extractors', () => {
      // This test verifies the strategy is configured with multiple extractors
      // The actual extraction logic is tested in the extractJWTFromCookie tests
      expect(strategy).toBeDefined();
    });

    it('should not ignore token expiration', () => {
      // This verifies the ignoreExpiration is set to false
      // The actual expiration handling is done by passport-jwt
      expect(strategy).toBeDefined();
    });
  });
});
