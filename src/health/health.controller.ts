import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { RedisHealthIndicator } from './redis.health';
import { PrismaService } from '../common/prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';
import { AppConfigService } from '../config/app-config.service';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private redisHealth: RedisHealthIndicator,
    private prisma: PrismaService,
    private readonly configService: AppConfigService,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () => this.redisHealth.isHealthy('redis'),
    ]);
  }

  @Get('legacy')
  @Public()
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: this.configService.config.server.nodeEnv,
      services: {
        database: 'connected',
        config: 'validated',
        redis: 'connected',
      },
    };
  }

  @Get('config')
  getConfigHealth() {
    const config = this.configService.config;

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.server.nodeEnv,
      configuration: {
        server: {
          port: config.server.port,
          frontendUrl: config.server.frontendUrl,
          environment: config.server.nodeEnv,
        },
        database: {
          connected: true,
          maxRetries: config.database.maxRetries,
          connectionTimeout: config.database.connectionTimeout,
        },
        auth: {
          jwtExpiresIn: config.auth.jwtExpiresIn,
          refreshTokenExpiresIn: config.auth.refreshTokenExpiresIn,
          secretConfigured: !!config.auth.jwtSecret,
        },
        supabase: {
          configured: !!config.supabase.url && !!config.supabase.key,
          url: config.supabase.url,
        },
        s3: {
          configured: !!config.s3.bucketName && !!config.s3.accessKeyId,
          bucketName: config.s3.bucketName,
          region: config.s3.region,
        },
        rateLimit: {
          ttl: config.rateLimit.ttl,
          limit: config.rateLimit.limit,
        },
      },
    };
  }
}
