import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';

import { PrismaService } from '../common/prisma/prisma.service';
import { LoggerService } from '../common/logger/logger.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { UserProfileService } from './services/user-profile.service';
import { AuthTokens, JwtPayload, UserData } from './types/auth.types';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly logger: LoggerService,
    private readonly supabaseService: SupabaseService,
    private readonly configService: AppConfigService,
    private readonly userProfileService: UserProfileService,
  ) {}

  async login(email: string, password: string) {
    try {
      // Use Supabase for authentication with retry logic
      const { data, error } = await this.supabaseService.executeWithRetry(
        async () => {
          try {
            const result = await this.supabaseService.signIn(email, password);
            return { data: result?.data || null, error: result?.error || null };
          } catch (err) {
            return { data: null, error: err };
          }
        },
      );

      if (error || !data?.user) {
        const errorMessage = this.extractErrorMessage(error);
        this.logger.logTrace('Supabase authentication failed', {
          email,
          error: errorMessage,
        });
        throw new UnauthorizedException('Invalid credentials');
      }

      // Get user from our database using Supabase user ID
      const user = await this.prisma.user.findUnique({
        where: { id: data.user.id },
      });

      if (!user) {
        throw new UnauthorizedException('User not found in database');
      }

      if (!user.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }

      // Get full user profile data
      const userProfile = await this.userProfileService.getUserProfile(user.id);

      // Generate tokens using the same method as register
      const tokens = await this.generateTokens({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });

      this.logger.logTrace('User login successful', {
        userId: user.id,
        email: user.email,
      });

      return {
        ...tokens,
        user: userProfile,
      };
    } catch (error) {
      this.logger.logError(error, AuthService.name, { email });
      throw error;
    }
  }

  /**
   * Create a new user in both Supabase and our database
   * @param userData User data for creation
   * @param options Creation options
   * @returns Created user data
   */
  async createUser(
    userData: {
      email: string;
      password: string;
      name: string;
      role?: 'admin' | 'editor' | 'viewer';
    },
    options: {
      generateTokens?: boolean;
      createdByAdmin?: boolean;
    } = {},
  ) {
    const { generateTokens = false, createdByAdmin = false } = options;

    try {
      // Check if user already exists in our database
      const existingUser = await this.prisma.user.findUnique({
        where: { email: userData.email },
      });

      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      // Register user with Supabase using retry logic
      const { data, error } = await this.supabaseService.executeWithRetry(
        async () => {
          try {
            const result = await this.supabaseService.signUp(
              userData.email,
              userData.password,
              { name: userData.name },
            );
            return { data: result?.data || null, error: result?.error || null };
          } catch (err) {
            return { data: null, error: err };
          }
        },
      );

      if (error || !data?.user) {
        const errorMessage =
          this.extractErrorMessage(error) ||
          'User creation failed - no user data returned';
        const errorToLog = new Error(errorMessage);
        this.logger.logError(errorToLog, AuthService.name, {
          email: userData.email,
        });
        throw new ConflictException(errorMessage);
      }

      // Determine role based on context
      const userRole = userData.role || (createdByAdmin ? 'editor' : 'admin');

      // Create user in our database with Supabase user ID
      const user = await this.prisma.user.create({
        data: {
          id: data.user.id,
          email: userData.email,
          name: userData.name,
          role: userRole,
          isActive: !createdByAdmin, // Users created by admin start as inactive
        },
      });

      this.logger.logTrace('User created', {
        userId: user.id,
        email: user.email,
        createdByAdmin,
      });

      const basicUserData = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };

      // Generate tokens if requested
      if (generateTokens) {
        const tokens = await this.generateTokens(basicUserData);
        return {
          ...tokens,
          user: basicUserData,
          message: 'User created successfully',
        };
      }

      return {
        user: basicUserData,
        message: 'User created successfully',
      };
    } catch (error) {
      this.logger.logError(error, AuthService.name, {
        email: userData.email,
      });
      throw error;
    }
  }

  async register(registerDto: {
    email: string;
    password: string;
    name: string;
  }) {
    return this.createUser(registerDto, { generateTokens: true });
  }

  /**
   * Generate JWT tokens for authentication
   * @param userData User data to include in tokens
   * @returns Access and refresh tokens
   */
  async generateTokens(userData: UserData): Promise<AuthTokens> {
    // Create the payload
    const payload: JwtPayload = {
      sub: userData.id,
      email: userData.email,
      role: userData.role || 'admin',
      name: userData.name,
    };

    this.logger.debug(`Generating tokens for user: ${userData.id}`);

    // Generate tokens in parallel
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.auth.jwtSecret,
        expiresIn: this.configService.auth.jwtExpiresIn,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.auth.jwtSecret,
        expiresIn: this.configService.auth.refreshTokenExpiresIn,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  async logout(): Promise<{ message: string }> {
    try {
      const { error } = await this.supabaseService.executeWithRetry(
        async () => {
          try {
            const result = await this.supabaseService.signOut();
            return { data: null, error: result?.error || null };
          } catch (err) {
            return { data: null, error: err };
          }
        },
      );

      if (error) {
        const errorMessage = this.extractErrorMessage(error) || 'Logout failed';
        const errorToLog = new Error(errorMessage);
        this.logger.logError(errorToLog, AuthService.name);
        throw new UnauthorizedException('Logout failed');
      }

      this.logger.logTrace('User logout');

      return { message: 'Logout successful' };
    } catch (error) {
      this.logger.logError(error, AuthService.name);
      throw error;
    }
  }

  async findUserById(id: string): Promise<User | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.logError(error, AuthService.name, { userId: id });
      return null;
    }
  }

  /**
   * Extract error message from unknown error type
   * @param error The error to extract message from
   * @returns Error message string
   */
  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String((error as { message: unknown }).message);
    }

    return String(error);
  }
}
