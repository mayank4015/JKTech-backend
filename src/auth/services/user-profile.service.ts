import { Injectable, NotFoundException } from '@nestjs/common';
import { User } from '@prisma/client';

import { PrismaService } from '../../common/prisma/prisma.service';
import { LoggerService } from '../../common/logger/logger.service';
import { SupabaseService } from '../../common/supabase/supabase.service';

@Injectable()
export class UserProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async getUserProfile(userId: string): Promise<Omit<User, 'password'>> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
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

      if (!user) {
        throw new NotFoundException('User not found');
      }

      return user;
    } catch (error) {
      this.logger.logError(error, UserProfileService.name, { userId });
      throw error;
    }
  }

  async updateUserProfile(
    userId: string,
    updateData: { name?: string; email?: string },
  ): Promise<Omit<User, 'password'>> {
    try {
      // Update user in our database
      const user = await this.prisma.user.update({
        where: { id: userId },
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

      // If email is being updated, we should also update it in Supabase
      // Note: This would require admin privileges in Supabase
      if (updateData.email) {
        try {
          // This is a placeholder - you might need to implement admin user update
          // or handle email changes through Supabase's email change flow
          this.logger.logTrace(
            'Email update requested - consider implementing Supabase email change flow',
            {
              userId,
              newEmail: updateData.email,
            },
          );
        } catch (supabaseError) {
          this.logger.logError(supabaseError, UserProfileService.name, {
            userId,
            operation: 'supabase_email_update',
          });
          // Don't throw here as the local update was successful
        }
      }

      this.logger.logTrace('User profile updated', { userId, updateData });

      return user;
    } catch (error) {
      this.logger.logError(error, UserProfileService.name, {
        userId,
        updateData,
      });
      throw error;
    }
  }

  async deactivateUser(userId: string): Promise<void> {
    try {
      // Deactivate user in our database
      await this.prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
      });

      // Note: In a production environment, you might want to also disable the user in Supabase
      // This would require admin privileges. For now, we'll just log it.
      this.logger.logTrace('User deactivated in local database', { userId });
      this.logger.logTrace(
        'Consider implementing Supabase user deactivation for complete security',
        { userId },
      );
    } catch (error) {
      this.logger.logError(error, UserProfileService.name, { userId });
      throw error;
    }
  }

  /**
   * Get user profile with Supabase auth data synchronization
   * This method can be used to sync user data between Supabase and local database
   */
  async getUserProfileWithSync(
    userId: string,
  ): Promise<Omit<User, 'password'>> {
    try {
      // Get user from local database
      const localUser = await this.getUserProfile(userId);

      // Optionally, you can verify the user exists in Supabase as well
      try {
        const supabaseUser = await this.supabaseService.getUserById(userId);
        if (!supabaseUser) {
          this.logger.logTrace('User exists locally but not in Supabase', {
            userId,
          });
        }
      } catch (supabaseError) {
        this.logger.logError(supabaseError, UserProfileService.name, {
          userId,
          operation: 'supabase_user_verification',
        });
        // Don't throw here as local user data is still valid
      }

      return localUser;
    } catch (error) {
      this.logger.logError(error, UserProfileService.name, { userId });
      throw error;
    }
  }
}
