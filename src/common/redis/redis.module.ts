import { Module, Global, OnModuleDestroy, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import type { Redis as RedisClient } from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';
import { AppConfigModule } from '../../config/app-config.module';
import { LoggerService } from '../logger/logger.service';
import { LoggerModule } from '../logger/logger.module';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  imports: [AppConfigModule, LoggerModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: async (
        configService: AppConfigService,
        logger: LoggerService,
      ): Promise<RedisClient> => {
        const redis = new Redis({
          host: configService.getRedisHost(),
          port: configService.getRedisPort(),
          password: configService.getRedisPassword(),
          db: configService.getRedisDb(),
          maxRetriesPerRequest: configService.getRedisMaxRetries(),
          connectTimeout: configService.getRedisConnectionTimeout(),
          commandTimeout: configService.getRedisCommandTimeout(),
          lazyConnect: false,
          keepAlive: 30000,
          family: 4,
          keyPrefix: 'jktech:',
          tls: configService.getRedisUseTls() ? {} : undefined,
          retryStrategy: (times: number) => {
            const delay = configService.getRedisRetryDelay();
            return Math.min(times * delay, 3000);
          },
        });

        // Connection event handlers
        redis.on('connect', () => {
          logger.log('Redis connection established');
        });

        redis.on('ready', () => {
          logger.log('Redis client ready');
        });

        redis.on('error', (error) => {
          logger.error('Redis connection error:', error.message);
        });

        redis.on('close', () => {
          logger.warn('Redis connection closed');
        });

        redis.on('reconnecting', () => {
          logger.log('Redis reconnecting...');
        });

        // Test connection
        try {
          await redis.ping();
          logger.log('Redis connection test successful');
        } catch (error) {
          logger.error(
            'Redis connection test failed:',
            error instanceof Error ? error.message : String(error),
          );
          // Don't throw error to allow app to start without Redis
        }

        return redis;
      },
      inject: [AppConfigService, LoggerService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  async onModuleDestroy() {
    try {
      await this.redis.quit();
    } catch {
      await this.redis.disconnect();
    }
  }
}
