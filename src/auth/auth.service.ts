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

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly logger: LoggerService,
    private readonly supabaseService: SupabaseService,
    private readonly userProfileService: UserProfileService,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    try {
      // Use Supabase for authentication
      const { data, error } = await this.supabaseService.signIn(
        email,
        password,
      );

      if (error || !data.user) {
        this.logger.logTrace('Supabase authentication failed', {
          email,
          error: error?.message,
        });
        return null;
      }

      // Get user from our database using Supabase user ID
      const user = await this.prisma.user.findUnique({
        where: { id: data.user.id },
      });

      return user;
    } catch (error) {
      this.logger.logError(error, AuthService.name, { email });
      return null;
    }
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Get full user profile data
    const userProfile = await this.userProfileService.getUserProfile(user.id);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    const accessToken = this.jwtService.sign(payload);

    this.logger.logTrace('User login', { userId: user.id, email: user.email });

    return {
      accessToken,
      user: userProfile,
    };
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
          password: '', // Password is managed by Supabase
          name: registerDto.name,
          role: 'admin',
        },
      });

      this.logger.logTrace('User registration', {
        userId: user.id,
        email: user.email,
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        message: 'Registration successful',
      };
    } catch (error) {
      this.logger.logError(error, AuthService.name, {
        email: registerDto.email,
      });
      throw error;
    }
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
