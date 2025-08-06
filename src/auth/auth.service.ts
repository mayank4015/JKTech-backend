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
      // Use Supabase for authentication directly
      const { data, error } = await this.supabaseService.signIn(
        email,
        password,
      );

      if (error || !data.user) {
        this.logger.logTrace('Supabase authentication failed', {
          email,
          error: error?.message,
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

  async register(registerDto: {
    email: string;
    password: string;
    name: string;
  }) {
    try {
      // Check if user already exists in our database
      const existingUser = await this.prisma.user.findUnique({
        where: { email: registerDto.email },
      });

      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      // Register user with Supabase
      const { data, error } = await this.supabaseService.signUp(
        registerDto.email,
        registerDto.password,
        { name: registerDto.name },
      );

      if (error || !data.user) {
        const errorToLog = error
          ? new Error(error.message)
          : new Error('Registration failed - no user data returned');
        this.logger.logError(errorToLog, AuthService.name, {
          email: registerDto.email,
        });
        throw new ConflictException(error?.message || 'Registration failed');
      }

      // Create user in our database with Supabase user ID
      const user = await this.prisma.user.create({
        data: {
          id: data.user.id,
          email: registerDto.email,
          name: registerDto.name,
          role: 'admin',
        },
      });

      this.logger.logTrace('User registration', {
        userId: user.id,
        email: user.email,
      });

      const basicUserData = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };

      // Generate tokens
      const tokens = await this.generateTokens(basicUserData);
      this.logger.debug(`Registration successful for user: ${user.email}`);

      return {
        ...tokens,
        user: basicUserData,
        message: 'Registration successful',
      };
    } catch (error) {
      this.logger.logError(error, AuthService.name, {
        email: registerDto.email,
      });
      throw error;
    }
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
      const { error } = await this.supabaseService.signOut();

      if (error) {
        const errorToLog = new Error(error.message);
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
}
