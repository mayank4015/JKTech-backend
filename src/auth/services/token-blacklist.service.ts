import { Injectable, Inject } from '@nestjs/common';
import type { Redis as RedisClient } from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { LoggerService } from '../../common/logger/logger.service';
import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class TokenBlacklistService {
  private readonly keyPrefix = 'blacklist:';

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly logger: LoggerService,
    private readonly configService: AppConfigService,
  ) {}

  async blacklistToken(jti: string, exp: number): Promise<void> {
    try {
      const ttl = exp - Math.floor(Date.now() / 1000);

      if (ttl > 0) {
        const key = `${this.keyPrefix}${jti}`;
        await this.redis.setex(key, ttl, '1');
        this.logger.debug(`Token blacklisted: ${jti}, TTL: ${ttl}s`);
      } else {
        this.logger.debug(`Token already expired, not blacklisting: ${jti}`);
      }
    } catch (error) {
      this.logger.error(`Failed to blacklist token ${jti}:`, error);
      // Don't throw error to prevent auth flow disruption
    }
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    try {
      const key = `${this.keyPrefix}${jti}`;
      const result = await this.redis.get(key);
      const isBlacklisted = result === '1';

      if (isBlacklisted) {
        this.logger.debug(`Token is blacklisted: ${jti}`);
      }

      return isBlacklisted;
    } catch (error) {
      this.logger.error(`Failed to check token blacklist for ${jti}:`, error);
      // Return false to prevent auth disruption if Redis is down
      return false;
    }
  }

  async blacklistUserTokens(
    userId: string,
    beforeTimestamp?: Date,
  ): Promise<void> {
    try {
      const pattern = `user_tokens:${userId}:*`;

      // Use SCAN instead of KEYS for production safety
      let cursor = '0';
      const keys: string[] = [];
      do {
        const [next, found] = await this.redis.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          500,
        );
        cursor = next;
        keys.push(...found);
      } while (cursor !== '0');

      for (const key of keys) {
        const tokenData = await this.redis.get(key);
        if (tokenData) {
          const { jti, exp, iat } = JSON.parse(tokenData);

          // Only blacklist tokens issued before the specified timestamp
          if (!beforeTimestamp || new Date(iat * 1000) < beforeTimestamp) {
            await this.blacklistToken(jti, exp);
          }
        }
      }

      this.logger.debug(`Blacklisted tokens for user: ${userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to blacklist user tokens for ${userId}:`,
        error,
      );
    }
  }

  async getBlacklistStats(): Promise<{ count: number; memoryUsage: string }> {
    try {
      // Use SCAN instead of KEYS for production safety
      let cursor = '0';
      const keys: string[] = [];
      do {
        const [next, found] = await this.redis.scan(
          cursor,
          'MATCH',
          `${this.keyPrefix}*`,
          'COUNT',
          500,
        );
        cursor = next;
        keys.push(...found);
      } while (cursor !== '0');

      // Get memory usage from INFO command
      const info = await this.redis.info('memory');
      const match = info.match(/used_memory_human:(.+)/);
      const memoryUsage = match ? match[1].trim() : 'unknown';

      return {
        count: keys.length,
        memoryUsage,
      };
    } catch (error) {
      this.logger.error('Failed to get blacklist stats:', error);
      return { count: 0, memoryUsage: '0 KB' };
    }
  }
}
