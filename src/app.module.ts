import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/app-config.module';
import { AppConfigService } from './config/app-config.service';
import { LoggerModule } from './common/logger/logger.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { RateLimitModule } from './common/rate-limit/rate-limit.module';
import { FileUploadModule } from './common/file-upload/file-upload.module';
import { AccessControlModule } from './common/access-control/access-control.module';
import { SupabaseModule } from './common/supabase/supabase.module';
import { RedisModule } from './common/redis/redis.module';
import { QueuesModule } from './common/queues/queues.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DocumentsModule } from './documents/documents.module';
import { IngestionsModule } from './ingestions/ingestions.module';
import { ProcessingModule } from './processing/processing.module';
import { HealthModule } from './health/health.module';
import { ProvidersModule } from './common/providers/providers.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AsyncContextMiddleware } from './common/middleware/async-context.middleware';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RoleGuard } from './auth/guards/role.guard';
import { ThrottlerBehindProxyGuard } from './common/rate-limit/throttler-behind-proxy.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ValidationPipe } from './common/pipes/validation.pipe';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ThrottlerExceptionFilter } from './common/rate-limit/throttler-exception.filter';
import { SanitizationModule } from './sanitization/sanitization.module';

@Module({
  imports: [
    // Configuration
    AppConfigModule,

    // Throttling
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: (configService: AppConfigService) => [
        {
          ttl: configService.getThrottleTtl(),
          limit: configService.getThrottleLimit(),
        },
      ],
      inject: [AppConfigService],
    }),

    // Core modules
    ProvidersModule,
    LoggerModule,
    PrismaModule,
    RateLimitModule,
    FileUploadModule,
    AccessControlModule,
    SupabaseModule,
    RedisModule,
    QueuesModule,
    SanitizationModule,

    // Feature modules
    AuthModule,
    UsersModule,
    DocumentsModule,
    IngestionsModule,
    ProcessingModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RoleGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    {
      provide: APP_FILTER,
      useClass: ThrottlerExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, AsyncContextMiddleware).forRoutes('*');
  }
}
