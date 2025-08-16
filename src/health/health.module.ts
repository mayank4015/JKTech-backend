import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis.health';
import { RedisModule } from '../common/redis/redis.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { AppConfigModule } from 'src/config/app-config.module';

@Module({
  imports: [TerminusModule, RedisModule, PrismaModule, AppConfigModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
