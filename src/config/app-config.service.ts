import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

/**
 * Environment validation schemas
 */
const baseEnvSchema = z.object({
  // Server Configuration
  PORT: z.coerce.number().min(1).max(65535).default(8080),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Database Configuration
  DATABASE_URL: z.string().min(1, 'Database URL is required'),
  DIRECT_URL: z.string().min(1, 'Direct URL is required'),
  DB_MAX_RETRIES: z.coerce.number().min(1).default(3),
  DB_RETRY_DELAY: z.coerce.number().min(100).default(1000),
  DB_MAX_RETRY_DELAY: z.coerce.number().min(1000).default(10000),
  DB_CONNECTION_TIMEOUT: z.coerce.number().min(5000).default(30000),

  // JWT Configuration
  JWT_SECRET: z.string().min(1, 'JWT Secret is required'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  // Supabase Configuration
  SUPABASE_URL: z.string().url('Invalid Supabase URL'),
  SUPABASE_KEY: z.string().min(1, 'Supabase key is required'),
  SUPABASE_SERVICE_KEY: z.string().min(1, 'Supabase service key is required'),

  // Rate Limiting Configuration
  THROTTLE_TTL: z.coerce.number().min(1).default(60),
  THROTTLE_LIMIT: z.coerce.number().min(1).default(10),

  // OAuth Configuration (Optional)
  GOOGLE_OAUTH_REDIRECT_URL: z.string().url().optional(),

  // S3 Configuration (Optional for file uploads)
  S3_BUCKET_NAME: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),

  // Redis Configuration (Optional for token blacklisting)
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().min(0).default(0),
  REDIS_MAX_RETRIES: z.coerce.number().min(1).default(3),
  REDIS_RETRY_DELAY: z.coerce.number().min(100).default(100),
  REDIS_CONNECTION_TIMEOUT: z.coerce.number().min(5000).default(5000),
  REDIS_COMMAND_TIMEOUT: z.coerce.number().min(5000).default(5000),
  REDIS_TLS: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
});

// Production-specific validation
const productionEnvSchema = baseEnvSchema.extend({
  JWT_SECRET: z
    .string()
    .min(32, 'JWT Secret must be at least 32 characters in production')
    .refine(
      (val) => !val.includes('default') && !val.includes('change'),
      'JWT Secret must not contain default values in production',
    ),
  NODE_ENV: z.literal('production'),
});

// Development-specific validation
const developmentEnvSchema = baseEnvSchema;

/**
 * Application configuration interface
 */
export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshTokenExpiresIn: string;
}

export interface ValidatedConfig {
  server: {
    port: number;
    frontendUrl: string;
    nodeEnv: string;
    isProduction: boolean;
    isDevelopment: boolean;
  };
  database: {
    url: string;
    directUrl: string;
    maxRetries: number;
    retryDelay: number;
    maxRetryDelay: number;
    connectionTimeout: number;
  };
  auth: {
    jwtSecret: string;
    jwtExpiresIn: string;
    refreshTokenExpiresIn: string;
  };
  supabase: {
    url: string;
    key: string;
    serviceKey: string;
  };
  s3: {
    bucketName?: string;
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    endpoint?: string;
  };
  oauth: {
    googleRedirectUrl?: string;
  };
  rateLimit: {
    ttl: number;
    limit: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
    maxRetries: number;
    retryDelay: number;
    connectionTimeout: number;
    commandTimeout: number;
    useTls: boolean;
  };
}

@Injectable()
export class AppConfigService implements OnModuleInit {
  private readonly logger = new Logger(AppConfigService.name);
  private validatedConfig: ValidatedConfig;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    if (!this.validatedConfig) {
      this.logger.log('🔍 Validating environment configuration...');
      this.validatedConfig = this.validateEnvironmentSync();
      this.logger.log('✅ Environment configuration validated successfully');
    }
  }

  /**
   * Validate environment variables based on NODE_ENV
   */
  private validateEnvironmentSync(): ValidatedConfig {
    const rawEnv = this.getRawEnvironmentVariables();
    const nodeEnv = rawEnv.NODE_ENV || 'development';

    try {
      let validatedEnv: z.infer<typeof baseEnvSchema>;

      if (nodeEnv === 'production') {
        this.logger.log('🏭 Validating production environment...');
        validatedEnv = productionEnvSchema.parse(rawEnv);
        this.validateProductionSecurity(validatedEnv);
      } else {
        this.logger.log('🛠️ Validating development environment...');
        validatedEnv = developmentEnvSchema.parse(rawEnv);
      }

      return this.transformToValidatedConfig(validatedEnv);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.issues.map(
          (err) => `${err.path.join('.')}: ${err.message}`,
        );
        this.logger.error('❌ Environment validation failed:');
        errorMessages.forEach((msg) => this.logger.error(`  - ${msg}`));
        throw new Error(
          `Environment validation failed:\n${errorMessages.join('\n')}`,
        );
      }
      throw error;
    }
  }

  /**
   * Additional production security validations
   */
  private validateProductionSecurity(env: any): void {
    const securityIssues: string[] = [];

    // Check for weak JWT secrets
    if (env.JWT_SECRET.length < 64) {
      securityIssues.push(
        'JWT_SECRET should be at least 64 characters in production',
      );
    }

    // Check for default database passwords
    if (
      env.DATABASE_URL.includes('password') ||
      env.DATABASE_URL.includes('123456')
    ) {
      securityIssues.push('DATABASE_URL appears to contain a weak password');
    }

    // Check HTTPS requirements
    if (!env.FRONTEND_URL.startsWith('https://')) {
      securityIssues.push('FRONTEND_URL should use HTTPS in production');
    }

    if (securityIssues.length > 0) {
      this.logger.warn('⚠️ Production security warnings:');
      securityIssues.forEach((issue) => this.logger.warn(`  - ${issue}`));
    }
  }

  /**
   * Get raw environment variables
   */
  private getRawEnvironmentVariables(): Record<string, any> {
    return {
      PORT: this.configService.get('PORT'),
      FRONTEND_URL: this.configService.get('FRONTEND_URL'),
      NODE_ENV: this.configService.get('NODE_ENV'),
      DATABASE_URL: this.configService.get('DATABASE_URL'),
      DIRECT_URL: this.configService.get('DIRECT_URL'),
      DB_MAX_RETRIES: this.configService.get('DB_MAX_RETRIES'),
      DB_RETRY_DELAY: this.configService.get('DB_RETRY_DELAY'),
      DB_MAX_RETRY_DELAY: this.configService.get('DB_MAX_RETRY_DELAY'),
      DB_CONNECTION_TIMEOUT: this.configService.get('DB_CONNECTION_TIMEOUT'),
      JWT_SECRET: this.configService.get('JWT_SECRET'),
      JWT_EXPIRES_IN: this.configService.get('JWT_EXPIRES_IN'),
      REFRESH_TOKEN_EXPIRES_IN: this.configService.get(
        'REFRESH_TOKEN_EXPIRES_IN',
      ),
      SUPABASE_URL: this.configService.get('SUPABASE_URL'),
      SUPABASE_KEY: this.configService.get('SUPABASE_KEY'),
      SUPABASE_SERVICE_KEY: this.configService.get('SUPABASE_SERVICE_KEY'),
      THROTTLE_TTL: this.configService.get('THROTTLE_TTL'),
      THROTTLE_LIMIT: this.configService.get('THROTTLE_LIMIT'),
      GOOGLE_OAUTH_REDIRECT_URL: this.configService.get(
        'GOOGLE_OAUTH_REDIRECT_URL',
      ),
      S3_BUCKET_NAME: this.configService.get('S3_BUCKET_NAME'),
      S3_REGION: this.configService.get('S3_REGION'),
      S3_ACCESS_KEY_ID: this.configService.get('S3_ACCESS_KEY_ID'),
      S3_SECRET_ACCESS_KEY: this.configService.get('S3_SECRET_ACCESS_KEY'),
      S3_ENDPOINT: this.configService.get('S3_ENDPOINT'),
      REDIS_HOST: this.configService.get('REDIS_HOST'),
      REDIS_PORT: this.configService.get('REDIS_PORT'),
      REDIS_PASSWORD: this.configService.get('REDIS_PASSWORD'),
      REDIS_DB: this.configService.get('REDIS_DB'),
      REDIS_MAX_RETRIES: this.configService.get('REDIS_MAX_RETRIES'),
      REDIS_RETRY_DELAY: this.configService.get('REDIS_RETRY_DELAY'),
      REDIS_CONNECTION_TIMEOUT: this.configService.get(
        'REDIS_CONNECTION_TIMEOUT',
      ),
      REDIS_COMMAND_TIMEOUT: this.configService.get('REDIS_COMMAND_TIMEOUT'),
      REDIS_TLS: this.configService.get('REDIS_TLS'),
    };
  }

  /**
   * Transform validated environment to structured config
   */
  private transformToValidatedConfig(
    env: z.infer<typeof baseEnvSchema>,
  ): ValidatedConfig {
    return {
      server: {
        port: env.PORT,
        frontendUrl: env.FRONTEND_URL,
        nodeEnv: env.NODE_ENV,
        isProduction: env.NODE_ENV === 'production',
        isDevelopment:
          env.NODE_ENV === 'development' || env.NODE_ENV === 'test',
      },
      database: {
        url: env.DATABASE_URL,
        directUrl: env.DIRECT_URL,
        maxRetries: env.DB_MAX_RETRIES,
        retryDelay: env.DB_RETRY_DELAY,
        maxRetryDelay: env.DB_MAX_RETRY_DELAY,
        connectionTimeout: env.DB_CONNECTION_TIMEOUT,
      },
      auth: {
        jwtSecret: env.JWT_SECRET,
        jwtExpiresIn: env.JWT_EXPIRES_IN,
        refreshTokenExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
      },
      supabase: {
        url: env.SUPABASE_URL,
        key: env.SUPABASE_KEY,
        serviceKey: env.SUPABASE_SERVICE_KEY,
      },
      s3: {
        bucketName: env.S3_BUCKET_NAME,
        region: env.S3_REGION,
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        endpoint: env.S3_ENDPOINT,
      },
      oauth: {
        googleRedirectUrl: env.GOOGLE_OAUTH_REDIRECT_URL,
      },
      rateLimit: {
        ttl: env.THROTTLE_TTL,
        limit: env.THROTTLE_LIMIT,
      },
      redis: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
        password: env.REDIS_PASSWORD,
        db: env.REDIS_DB,
        maxRetries: env.REDIS_MAX_RETRIES,
        retryDelay: env.REDIS_RETRY_DELAY,
        connectionTimeout: env.REDIS_CONNECTION_TIMEOUT,
        commandTimeout: env.REDIS_COMMAND_TIMEOUT,
        useTls: env.REDIS_TLS,
      },
    };
  }

  /**
   * Get validated configuration
   */
  get config(): ValidatedConfig {
    if (!this.validatedConfig) {
      // If config hasn't been validated yet, validate it synchronously
      this.logger.log('🔍 Validating environment configuration (on-demand)...');
      this.validatedConfig = this.validateEnvironmentSync();
      this.logger.log('✅ Environment configuration validated successfully');
    }
    return this.validatedConfig;
  }

  // Backward compatibility methods - delegate to validated config
  /**
   * Get authentication configuration
   */
  get auth(): AuthConfig {
    return this.config.auth;
  }

  // Server Configuration
  getPort(): number {
    return this.config.server.port;
  }

  getFrontendUrl(): string {
    return this.config.server.frontendUrl;
  }

  // Database Configuration
  getDatabaseUrl(): string {
    return this.config.database.url;
  }

  getDirectUrl(): string {
    return this.config.database.directUrl;
  }

  getDbMaxRetries(): number {
    return this.config.database.maxRetries;
  }

  getDbRetryDelay(): number {
    return this.config.database.retryDelay;
  }

  getDbMaxRetryDelay(): number {
    return this.config.database.maxRetryDelay;
  }

  getDbConnectionTimeout(): number {
    return this.config.database.connectionTimeout;
  }

  // JWT Configuration
  getJwtSecret(): string {
    return this.config.auth.jwtSecret;
  }

  getJwtExpiresIn(): string {
    return this.config.auth.jwtExpiresIn;
  }

  getRefreshTokenExpiresIn(): string {
    return this.config.auth.refreshTokenExpiresIn;
  }

  // Supabase Configuration
  getSupabaseUrl(): string {
    return this.config.supabase.url;
  }

  getSupabaseKey(): string {
    return this.config.supabase.key;
  }

  getSupabaseServiceKey(): string {
    return this.config.supabase.serviceKey;
  }

  // S3 Configuration
  getS3BucketName(): string {
    return this.config.s3.bucketName || '';
  }

  getS3Region(): string {
    return this.config.s3.region;
  }

  getS3AccessKeyId(): string {
    return this.config.s3.accessKeyId || '';
  }

  getS3SecretAccessKey(): string {
    return this.config.s3.secretAccessKey || '';
  }

  getS3Endpoint(): string {
    return this.config.s3.endpoint || 'https://s3.amazonaws.com';
  }

  // OAuth Configuration
  getGoogleOAuthRedirectUrl(): string {
    return (
      this.config.oauth.googleRedirectUrl ||
      'http://localhost:3000/auth/callback'
    );
  }

  // Rate Limiting Configuration
  getThrottleTtl(): number {
    return this.config.rateLimit.ttl;
  }

  getThrottleLimit(): number {
    return this.config.rateLimit.limit;
  }

  // Redis Configuration
  getRedisHost(): string {
    return this.config.redis.host;
  }

  getRedisPort(): number {
    return this.config.redis.port;
  }

  getRedisPassword(): string | undefined {
    return this.config.redis.password;
  }

  getRedisDb(): number {
    return this.config.redis.db;
  }

  getRedisMaxRetries(): number {
    return this.config.redis.maxRetries;
  }

  getRedisRetryDelay(): number {
    return this.config.redis.retryDelay;
  }

  getRedisConnectionTimeout(): number {
    return this.config.redis.connectionTimeout;
  }

  getRedisCommandTimeout(): number {
    return this.config.redis.commandTimeout;
  }

  getRedisUseTls(): boolean {
    return this.config.redis.useTls;
  }

  // Environment
  isProduction(): boolean {
    return this.config.server.isProduction;
  }

  isDevelopment(): boolean {
    return this.config.server.isDevelopment;
  }
}
