import { Controller, Get } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

@Controller('health')
export class HealthController {
  constructor(private readonly configService: AppConfigService) {}

  @Get()
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: this.configService.config.server.nodeEnv,
      services: {
        database: 'connected',
        config: 'validated',
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
