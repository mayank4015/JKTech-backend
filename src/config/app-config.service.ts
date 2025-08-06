import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private configService: ConfigService) {}

  // Server Configuration
  getPort(): number {
    return this.configService.get<number>('PORT', 8080);
  }

  getFrontendUrl(): string {
    return this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
  }

  // Database Configuration
  getDatabaseUrl(): string {
    return this.configService.get<string>('DATABASE_URL') || '';
  }

  getDirectUrl(): string {
    return this.configService.get<string>('DIRECT_URL') || '';
  }

  getDbMaxRetries(): number {
    return this.configService.get<number>('DB_MAX_RETRIES', 3);
  }

  getDbRetryDelay(): number {
    return this.configService.get<number>('DB_RETRY_DELAY', 1000);
  }

  getDbMaxRetryDelay(): number {
    return this.configService.get<number>('DB_MAX_RETRY_DELAY', 10000);
  }

  getDbConnectionTimeout(): number {
    return this.configService.get<number>('DB_CONNECTION_TIMEOUT', 30000);
  }

  // JWT Configuration
  getJwtSecret(): string {
    return (
      this.configService.get<string>('JWT_SECRET') ||
      'default-secret-change-in-production'
    );
  }

  getJwtExpiresIn(): string {
    return this.configService.get<string>('JWT_EXPIRES_IN', '1h');
  }

  getRefreshTokenExpiresIn(): string {
    return this.configService.get<string>('REFRESH_TOKEN_EXPIRES_IN', '7d');
  }

  // Supabase Configuration
  getSupabaseUrl(): string {
    return this.configService.get<string>('SUPABASE_URL') || '';
  }

  getSupabaseKey(): string {
    return this.configService.get<string>('SUPABASE_KEY') || '';
  }

  getSupabaseServiceKey(): string {
    return this.configService.get<string>('SUPABASE_SERVICE_KEY') || '';
  }

  // S3 Configuration
  getS3BucketName(): string {
    return this.configService.get<string>('S3_BUCKET_NAME') || '';
  }

  getS3Region(): string {
    return this.configService.get<string>('S3_REGION', 'us-east-1');
  }

  getS3AccessKeyId(): string {
    return this.configService.get<string>('S3_ACCESS_KEY_ID') || '';
  }

  getS3SecretAccessKey(): string {
    return this.configService.get<string>('S3_SECRET_ACCESS_KEY') || '';
  }

  getS3Endpoint(): string {
    return this.configService.get<string>(
      'S3_ENDPOINT',
      'https://s3.amazonaws.com',
    );
  }

  // OAuth Configuration
  getGoogleOAuthRedirectUrl(): string {
    return this.configService.get<string>(
      'GOOGLE_OAUTH_REDIRECT_URL',
      'http://localhost:3000/auth/callback',
    );
  }

  // Rate Limiting Configuration
  getThrottleTtl(): number {
    return this.configService.get<number>('THROTTLE_TTL', 60);
  }

  getThrottleLimit(): number {
    return this.configService.get<number>('THROTTLE_LIMIT', 10);
  }

  // Environment
  isProduction(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'production';
  }

  isDevelopment(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'development';
  }
}
