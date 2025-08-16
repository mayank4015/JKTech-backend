import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';

import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { UserProfileService } from './services/user-profile.service';
import { TokenBlacklistService } from './services/token-blacklist.service';
import { AppConfigService } from '../config/app-config.service';
import { AuthTokens, JwtPayload } from './types/auth.types';
import {
  SupabaseSignInResponse,
  SupabaseSignUpResponse,
  SupabaseSignOutResponse,
} from './types/test.types';

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: DeepMockProxy<PrismaService>;
  let jwtService: DeepMockProxy<JwtService>;
  let loggerService: DeepMockProxy<LoggerService>;
  let supabaseService: DeepMockProxy<SupabaseService>;
  let configService: DeepMockProxy<AppConfigService>;
  let userProfileService: DeepMockProxy<UserProfileService>;
  let tokenBlacklistService: DeepMockProxy<TokenBlacklistService>;

  const mockUser = testUtils.createMockUser();
  const mockJwtPayload = testUtils.createMockJwtPayload();
  const mockAuthTokens = testUtils.createMockAuthTokens();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockDeep<PrismaService>(),
        },
        {
          provide: JwtService,
          useValue: mockDeep<JwtService>(),
        },
        {
          provide: LoggerService,
          useValue: mockDeep<LoggerService>(),
        },
        {
          provide: SupabaseService,
          useValue: mockDeep<SupabaseService>(),
        },
        {
          provide: AppConfigService,
          useValue: mockDeep<AppConfigService>(),
        },
        {
          provide: UserProfileService,
          useValue: mockDeep<UserProfileService>(),
        },
        {
          provide: TokenBlacklistService,
          useValue: mockDeep<TokenBlacklistService>(),
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get(PrismaService);
    jwtService = module.get(JwtService);
    loggerService = module.get(LoggerService);
    supabaseService = module.get(SupabaseService);
    configService = module.get(AppConfigService);
    userProfileService = module.get(UserProfileService);
    tokenBlacklistService = module.get(TokenBlacklistService);

    // Setup default config service mocks
    Object.defineProperty(configService, 'auth', {
      get: () => ({
        jwtSecret: 'test-secret',
        jwtExpiresIn: '1h',
        refreshTokenExpiresIn: '7d',
      }),
      configurable: true,
    });

    // Mock executeWithRetry to call the operation directly
    supabaseService.executeWithRetry.mockImplementation(async (operation) => {
      return await operation();
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    const loginData = {
      email: 'test@example.com',
      password: 'password123',
    };

    describe('Positive Cases', () => {
      it('should successfully login with valid credentials', async () => {
        // Arrange
        const mockSupabaseUser = testUtils.createMockSupabaseUser({
          id: mockUser.id,
        });
        const mockSession = testUtils.createMockSession(mockSupabaseUser);
        const supabaseResponse: SupabaseSignInResponse = {
          data: {
            user: mockSupabaseUser,
            session: mockSession,
          },
          error: null,
        };

        supabaseService.signIn.mockResolvedValue(supabaseResponse);
        prismaService.user.findUnique.mockResolvedValue(mockUser);
        userProfileService.getUserProfile.mockResolvedValue(mockUser);
        jwtService.signAsync.mockResolvedValueOnce(mockAuthTokens.accessToken);
        jwtService.signAsync.mockResolvedValueOnce(mockAuthTokens.refreshToken);

        // Act
        const result = await service.login(loginData.email, loginData.password);

        // Assert
        expect(supabaseService.signIn).toHaveBeenCalledWith(
          loginData.email,
          loginData.password,
        );
        expect(prismaService.user.findUnique).toHaveBeenCalledWith({
          where: { id: mockUser.id },
        });
        expect(userProfileService.getUserProfile).toHaveBeenCalledWith(
          mockUser.id,
        );
        expect(result).toEqual({
          accessToken: mockAuthTokens.accessToken,
          refreshToken: mockAuthTokens.refreshToken,
          user: mockUser,
        });
        expect(loggerService.logTrace).toHaveBeenCalledWith(
          'User login successful',
          { userId: mockUser.id, email: mockUser.email },
        );
      });

      it('should generate JWT tokens with correct payload', async () => {
        // Arrange
        const mockSupabaseUser = testUtils.createMockSupabaseUser({
          id: mockUser.id,
        });
        const mockSession = testUtils.createMockSession(mockSupabaseUser);
        const supabaseResponse: SupabaseSignInResponse = {
          data: {
            user: mockSupabaseUser,
            session: mockSession,
          },
          error: null,
        };

        supabaseService.signIn.mockResolvedValue(supabaseResponse);
        prismaService.user.findUnique.mockResolvedValue(mockUser);
        userProfileService.getUserProfile.mockResolvedValue(mockUser);
        jwtService.signAsync.mockResolvedValueOnce(mockAuthTokens.accessToken);
        jwtService.signAsync.mockResolvedValueOnce(mockAuthTokens.refreshToken);

        // Act
        await service.login(loginData.email, loginData.password);

        // Assert
        expect(jwtService.signAsync).toHaveBeenCalledTimes(2);

        // Check that both calls include JTI and other expected fields
        const firstCall = jwtService.signAsync.mock.calls[0];
        const secondCall = jwtService.signAsync.mock.calls[1];

        const firstPayload = firstCall[0] as JwtPayload;
        const secondPayload = secondCall[0] as JwtPayload;

        expect(firstPayload).toMatchObject({
          sub: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          role: mockUser.role,
        });
        expect(firstPayload).toHaveProperty('jti');
        expect(typeof firstPayload.jti).toBe('string');

        expect(secondPayload).toMatchObject({
          sub: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          role: mockUser.role,
        });
        expect(secondPayload).toHaveProperty('jti');
        expect(typeof secondPayload.jti).toBe('string');

        // Ensure JTIs are different
        expect(firstPayload.jti).not.toBe(secondPayload.jti);
      });
    });

    describe('Negative Cases', () => {
      it('should throw UnauthorizedException for invalid credentials', async () => {
        // Arrange
        const mockAuthError = testUtils.createMockAuthError(
          'Invalid credentials',
        );
        const supabaseResponse: SupabaseSignInResponse = {
          data: { user: null, session: null },
          error: mockAuthError,
        };

        supabaseService.signIn.mockResolvedValue(supabaseResponse);

        // Act & Assert
        await expect(
          service.login(loginData.email, loginData.password),
        ).rejects.toThrow(UnauthorizedException);

        expect(loggerService.logTrace).toHaveBeenCalledWith(
          'Supabase authentication failed',
          {
            email: loginData.email,
            error: 'Invalid credentials',
          },
        );
      });

      it('should throw UnauthorizedException when user not found in database', async () => {
        // Arrange
        const mockSupabaseUser = testUtils.createMockSupabaseUser({
          id: mockUser.id,
        });
        const mockSession = testUtils.createMockSession(mockSupabaseUser);
        const supabaseResponse: SupabaseSignInResponse = {
          data: {
            user: mockSupabaseUser,
            session: mockSession,
          },
          error: null,
        };

        supabaseService.signIn.mockResolvedValue(supabaseResponse);
        prismaService.user.findUnique.mockResolvedValue(null);

        // Act & Assert
        await expect(
          service.login(loginData.email, loginData.password),
        ).rejects.toThrow(
          new UnauthorizedException('User not found in database'),
        );
      });

      it('should throw UnauthorizedException for deactivated user', async () => {
        // Arrange
        const inactiveUser = { ...mockUser, isActive: false };
        const mockSupabaseUser = testUtils.createMockSupabaseUser({
          id: mockUser.id,
        });
        const mockSession = testUtils.createMockSession(mockSupabaseUser);
        const supabaseResponse: SupabaseSignInResponse = {
          data: {
            user: mockSupabaseUser,
            session: mockSession,
          },
          error: null,
        };

        supabaseService.signIn.mockResolvedValue(supabaseResponse);
        prismaService.user.findUnique.mockResolvedValue(inactiveUser);

        // Act & Assert
        await expect(
          service.login(loginData.email, loginData.password),
        ).rejects.toThrow(new UnauthorizedException('Account is deactivated'));
      });

      it('should handle and log errors properly', async () => {
        // Arrange
        const error = new Error('Database connection failed');
        supabaseService.signIn.mockRejectedValue(error);

        // Act & Assert
        await expect(
          service.login(loginData.email, loginData.password),
        ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));

        expect(loggerService.logTrace).toHaveBeenCalledWith(
          'Supabase authentication failed',
          {
            email: loginData.email,
            error: 'Database connection failed',
          },
        );
      });
    });
  });

  describe('register', () => {
    const registerData = {
      email: 'newuser@example.com',
      password: 'password123',
      name: 'New User',
    };

    describe('Positive Cases', () => {
      it('should successfully register a new user', async () => {
        // Arrange
        const mockSupabaseUser = testUtils.createMockSupabaseUser({
          id: 'new-user-id',
        });
        const supabaseResponse: SupabaseSignUpResponse = {
          data: {
            user: mockSupabaseUser,
            session: null,
          },
          error: null,
        };
        const newUser = testUtils.createMockUser({
          id: mockSupabaseUser.id,
          email: registerData.email,
          name: registerData.name,
          role: 'admin',
        });

        prismaService.user.findUnique.mockResolvedValue(null);
        supabaseService.signUp.mockResolvedValue(supabaseResponse);
        prismaService.user.create.mockResolvedValue(newUser);
        jwtService.signAsync.mockResolvedValueOnce(mockAuthTokens.accessToken);
        jwtService.signAsync.mockResolvedValueOnce(mockAuthTokens.refreshToken);

        // Act
        const result = await service.register(registerData);

        // Assert
        expect(prismaService.user.findUnique).toHaveBeenCalledWith({
          where: { email: registerData.email },
        });
        expect(supabaseService.signUp).toHaveBeenCalledWith(
          registerData.email,
          registerData.password,
          { name: registerData.name },
        );
        expect(prismaService.user.create).toHaveBeenCalledWith({
          data: {
            id: mockSupabaseUser.id,
            email: registerData.email,
            name: registerData.name,
            role: 'admin',
            isActive: true,
          },
        });
        expect(result).toEqual({
          accessToken: mockAuthTokens.accessToken,
          refreshToken: mockAuthTokens.refreshToken,
          user: {
            id: newUser.id,
            email: newUser.email,
            name: newUser.name,
            role: newUser.role,
          },
          message: 'User created successfully',
        });
      });

      it('should create user with editor role when created by admin', async () => {
        // Arrange
        const mockSupabaseUser = testUtils.createMockSupabaseUser({
          id: 'new-user-id',
        });
        const supabaseResponse: SupabaseSignUpResponse = {
          data: {
            user: mockSupabaseUser,
            session: null,
          },
          error: null,
        };
        const userData = {
          ...registerData,
          role: 'editor' as const,
        };

        prismaService.user.findUnique.mockResolvedValue(null);
        supabaseService.signUp.mockResolvedValue(supabaseResponse);
        prismaService.user.create.mockResolvedValue(
          testUtils.createMockUser({
            id: mockSupabaseUser.id,
            role: 'editor',
          }),
        );

        // Act
        const result = await service.createUser(userData, {
          generateTokens: false,
          createdByAdmin: true,
        });

        // Assert
        expect(prismaService.user.create).toHaveBeenCalledWith({
          data: {
            id: mockSupabaseUser.id,
            email: userData.email,
            name: userData.name,
            role: 'editor',
            isActive: false, // Users created by admin start as inactive
          },
        });
        expect(result.message).toBe('User created successfully');
      });
    });

    describe('Negative Cases', () => {
      it('should throw ConflictException for duplicate email', async () => {
        // Arrange
        prismaService.user.findUnique.mockResolvedValue(mockUser);

        // Act & Assert
        await expect(service.register(registerData)).rejects.toThrow(
          new ConflictException('User with this email already exists'),
        );

        expect(supabaseService.signUp).not.toHaveBeenCalled();
      });

      it('should throw ConflictException when Supabase signup fails', async () => {
        // Arrange
        const mockAuthError = testUtils.createMockAuthError(
          'Email already registered',
        );
        const supabaseResponse: SupabaseSignUpResponse = {
          data: { user: null, session: null },
          error: mockAuthError,
        };

        prismaService.user.findUnique.mockResolvedValue(null);
        supabaseService.signUp.mockResolvedValue(supabaseResponse);

        // Act & Assert
        await expect(service.register(registerData)).rejects.toThrow(
          new ConflictException('Email already registered'),
        );

        expect(loggerService.logError).toHaveBeenCalled();
      });

      it('should handle database errors during user creation', async () => {
        // Arrange
        const mockSupabaseUser = testUtils.createMockSupabaseUser({
          id: 'new-user-id',
        });
        const supabaseResponse: SupabaseSignUpResponse = {
          data: {
            user: mockSupabaseUser,
            session: null,
          },
          error: null,
        };
        const dbError = new Error('Database constraint violation');

        prismaService.user.findUnique.mockResolvedValue(null);
        supabaseService.signUp.mockResolvedValue(supabaseResponse);
        prismaService.user.create.mockRejectedValue(dbError);

        // Act & Assert
        await expect(service.register(registerData)).rejects.toThrow(dbError);

        expect(loggerService.logError).toHaveBeenCalledWith(
          dbError,
          AuthService.name,
          { email: registerData.email },
        );
      });
    });
  });

  describe('generateTokens', () => {
    const userData = {
      id: mockUser.id,
      email: mockUser.email,
      name: mockUser.name,
      role: mockUser.role,
    };

    describe('Positive Cases', () => {
      it('should generate access and refresh tokens', async () => {
        // Arrange
        jwtService.signAsync.mockResolvedValueOnce(mockAuthTokens.accessToken);
        jwtService.signAsync.mockResolvedValueOnce(mockAuthTokens.refreshToken);

        // Act
        const result = await service.generateTokens(userData);

        // Assert
        expect(result).toEqual(mockAuthTokens);
        expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
        expect(loggerService.debug).toHaveBeenCalledWith(
          `Generating tokens for user: ${userData.id}`,
        );
      });

      it('should use default role when role is not provided', async () => {
        // Arrange
        const userDataWithoutRole = { ...userData, role: undefined };
        jwtService.signAsync.mockResolvedValueOnce(mockAuthTokens.accessToken);
        jwtService.signAsync.mockResolvedValueOnce(mockAuthTokens.refreshToken);

        // Act
        await service.generateTokens(userDataWithoutRole);

        // Assert
        expect(jwtService.signAsync).toHaveBeenCalledTimes(2);

        // Check that both calls include JTI and default role
        const firstCall = jwtService.signAsync.mock.calls[0];
        const secondCall = jwtService.signAsync.mock.calls[1];

        const firstPayload = firstCall[0] as JwtPayload;
        const secondPayload = secondCall[0] as JwtPayload;

        expect(firstPayload).toMatchObject({
          sub: userData.id,
          email: userData.email,
          name: userData.name,
          role: 'admin', // Default role
        });
        expect(firstPayload).toHaveProperty('jti');

        expect(secondPayload).toMatchObject({
          sub: userData.id,
          email: userData.email,
          name: userData.name,
          role: 'admin', // Default role
        });
        expect(secondPayload).toHaveProperty('jti');
      });
    });
  });

  describe('logout', () => {
    describe('Positive Cases', () => {
      it('should successfully logout user', async () => {
        // Arrange
        supabaseService.signOut.mockResolvedValue({ error: null });

        // Act
        const result = await service.logout();

        // Assert
        expect(supabaseService.signOut).toHaveBeenCalled();
        expect(result).toEqual({ message: 'Logout successful' });
        expect(loggerService.logTrace).toHaveBeenCalledWith('User logout');
      });
    });

    describe('Negative Cases', () => {
      it('should throw UnauthorizedException when logout fails', async () => {
        // Arrange
        const mockAuthError = testUtils.createMockAuthError('Logout failed');
        const signOutResponse: SupabaseSignOutResponse = {
          error: mockAuthError,
        };
        supabaseService.signOut.mockResolvedValue(signOutResponse);

        // Act & Assert
        await expect(service.logout()).rejects.toThrow(
          new UnauthorizedException('Logout failed'),
        );

        expect(loggerService.logError).toHaveBeenCalled();
      });

      it('should handle unexpected errors during logout', async () => {
        // Arrange
        const error = new Error('Network error');
        supabaseService.signOut.mockRejectedValue(error);

        // Act & Assert
        await expect(service.logout()).rejects.toThrow(
          new UnauthorizedException('Logout failed'),
        );

        expect(loggerService.logError).toHaveBeenCalled();
      });
    });
  });

  describe('findUserById', () => {
    describe('Positive Cases', () => {
      it('should return user when found', async () => {
        // Arrange
        prismaService.user.findUnique.mockResolvedValue(mockUser);

        // Act
        const result = await service.findUserById(mockUser.id);

        // Assert
        expect(result).toEqual(mockUser);
        expect(prismaService.user.findUnique).toHaveBeenCalledWith({
          where: { id: mockUser.id },
        });
      });

      it('should return null when user not found', async () => {
        // Arrange
        prismaService.user.findUnique.mockResolvedValue(null);

        // Act
        const result = await service.findUserById('non-existent-id');

        // Assert
        expect(result).toBeNull();
      });
    });

    describe('Negative Cases', () => {
      it('should return null and log error when database query fails', async () => {
        // Arrange
        const error = new Error('Database connection failed');
        prismaService.user.findUnique.mockRejectedValue(error);

        // Act
        const result = await service.findUserById(mockUser.id);

        // Assert
        expect(result).toBeNull();
        expect(loggerService.logError).toHaveBeenCalledWith(
          error,
          AuthService.name,
          { userId: mockUser.id },
        );
      });
    });
  });
});
