import { Injectable, Inject } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { Redis as RedisClient } from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const result = await this.redis.ping();
      const isHealthy = result === 'PONG';

      if (isHealthy) {
        return indicator.up({
          status: result,
          connection: this.redis.status,
        });
      }

      return indicator.down({
        status: result,
        connection: this.redis.status,
      });
    } catch (error) {
      return indicator.down({
        message: error.message,
        connection: this.redis.status,
      });
    }
  }
}
