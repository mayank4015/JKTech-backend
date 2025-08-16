import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

import { AppConfigService, ValidatedConfig } from './app-config.service';

describe('AppConfigService', () => {
  let service: AppConfigService;
  let configService: jest.Mocked<ConfigService>;
  let loggerSpy: jest.SpyInstance;

  // Valid base configuration for testing
  const validBaseConfig = {
    PORT: '8080',
    FRONTEND_URL: 'http://localhost:3000',
    NODE_ENV: 'development',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/testdb',
    DIRECT_URL: 'postgresql://user:pass@localhost:5432/testdb',
    JWT_SECRET: 'test-jwt-secret-short',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_KEY: 'test-supabase-key',
    SUPABASE_SERVICE_KEY: 'test-supabase-service-key',
  };

  const validProductionConfig = {
    ...validBaseConfig,
    NODE_ENV: 'production',
    FRONTEND_URL: 'https://production.example.com',
    JWT_SECRET:
      'super-secure-production-jwt-secret-key-with-64-characters-minimum',
  };

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppConfigService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<AppConfigService>(AppConfigService);
    configService = module.get(ConfigService);

    // Spy on logger methods
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Environment Validation', () => {
    describe('Development Environment', () => {
      beforeEach(() => {
        mockConfigServiceGet(validBaseConfig);
      });

      it('should validate development configuration successfully', () => {
        const config = service.config;

        expect(config).toBeDefined();
        expect(config.server.nodeEnv).toBe('development');
        expect(config.server.isDevelopment).toBe(true);
        expect(config.server.isProduction).toBe(false);
        expect(config.server.port).toBe(8080);
        expect(config.server.frontendUrl).toBe('http://localhost:3000');
      });

      it('should apply default values for optional fields', () => {
        const config = service.config;

        expect(config.database.maxRetries).toBe(3);
        expect(config.database.retryDelay).toBe(1000);
        expect(config.database.maxRetryDelay).toBe(10000);
        expect(config.database.connectionTimeout).toBe(30000);
        expect(config.rateLimit.ttl).toBe(60);
        expect(config.rateLimit.limit).toBe(10);
        expect(config.s3.region).toBe('us-east-1');
      });

      it('should allow shorter JWT secrets in development', () => {
        const config = service.config;

        expect(config.auth.jwtSecret).toBe('test-jwt-secret-short');
        expect(config.auth.jwtSecret.length).toBeLessThan(32);
      });

      it('should handle optional S3 configuration', () => {
        const config = service.config;

        expect(config.s3.bucketName).toBeUndefined();
        expect(config.s3.accessKeyId).toBeUndefined();
        expect(config.s3.secretAccessKey).toBeUndefined();
        expect(config.s3.endpoint).toBeUndefined();
        expect(config.s3.region).toBe('us-east-1'); // Default value
      });

      it('should handle optional OAuth configuration', () => {
        const config = service.config;

        expect(config.oauth.googleRedirectUrl).toBeUndefined();
      });
    });

    describe('Production Environment', () => {
      beforeEach(() => {
        mockConfigServiceGet(validProductionConfig);
      });

      it('should validate production configuration successfully', () => {
        const config = service.config;

        expect(config).toBeDefined();
        expect(config.server.nodeEnv).toBe('production');
        expect(config.server.isProduction).toBe(true);
        expect(config.server.isDevelopment).toBe(false);
        expect(config.server.frontendUrl).toBe(
          'https://production.example.com',
        );
      });

      it('should require strong JWT secret in production', () => {
        const config = service.config;

        expect(config.auth.jwtSecret).toBe(validProductionConfig.JWT_SECRET);
        expect(config.auth.jwtSecret.length).toBeGreaterThanOrEqual(32);
      });

      it('should log production validation', () => {
        service.config; // Trigger validation

        expect(loggerSpy).toHaveBeenCalledWith(
          '🏭 Validating production environment...',
        );
      });
    });

    describe('Test Environment', () => {
      beforeEach(() => {
        mockConfigServiceGet({
          ...validBaseConfig,
          NODE_ENV: 'test',
        });
      });

      it('should validate test configuration successfully', () => {
        const config = service.config;

        expect(config).toBeDefined();
        expect(config.server.nodeEnv).toBe('test');
        expect(config.server.isDevelopment).toBe(true); // Test is treated as development
        expect(config.server.isProduction).toBe(false);
      });
    });
  });

  describe('Security Validation', () => {
    describe('JWT Secret Validation', () => {
      it('should reject weak JWT secrets in production', () => {
        mockConfigServiceGet({
          ...validProductionConfig,
          JWT_SECRET: 'weak',
        });

        expect(() => service.config).toThrow(
          /JWT Secret must be at least 32 characters in production/,
        );
      });

      it('should reject JWT secrets with default values in production', () => {
        mockConfigServiceGet({
          ...validProductionConfig,
          JWT_SECRET: 'please-change-this-default-secret-key-in-production',
        });

        expect(() => service.config).toThrow(
          /JWT Secret must not contain default values in production/,
        );
      });

      it('should reject JWT secrets containing "change" in production', () => {
        mockConfigServiceGet({
          ...validProductionConfig,
          JWT_SECRET: 'super-secure-but-please-change-this-secret-key',
        });

        expect(() => service.config).toThrow(
          /JWT Secret must not contain default values in production/,
        );
      });
    });

    describe('Production Security Checks', () => {
      it('should warn about short JWT secrets in production', () => {
        const warnSpy = jest.spyOn(Logger.prototype, 'warn');

        mockConfigServiceGet({
          ...validProductionConfig,
          JWT_SECRET: 'exactly-32-characters-long-key!!', // Exactly 34 chars, meets minimum but less than recommended 64
        });

        service.config; // Trigger validation

        expect(warnSpy).toHaveBeenCalledWith(
          '⚠️ Production security warnings:',
        );
        expect(warnSpy).toHaveBeenCalledWith(
          '  - JWT_SECRET should be at least 64 characters in production',
        );
      });

      it('should warn about weak database passwords in production', () => {
        const warnSpy = jest.spyOn(Logger.prototype, 'warn');

        mockConfigServiceGet({
          ...validProductionConfig,
          DATABASE_URL: 'postgresql://user:password@localhost:5432/db',
        });

        service.config; // Trigger validation

        expect(warnSpy).toHaveBeenCalledWith(
          '  - DATABASE_URL appears to contain a weak password',
        );
      });

      it('should warn about HTTP URLs in production', () => {
        const warnSpy = jest.spyOn(Logger.prototype, 'warn');

        mockConfigServiceGet({
          ...validProductionConfig,
          FRONTEND_URL: 'http://production.example.com',
        });

        service.config; // Trigger validation

        expect(warnSpy).toHaveBeenCalledWith(
          '  - FRONTEND_URL should use HTTPS in production',
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw detailed error for missing required fields', () => {
      mockConfigServiceGet({
        NODE_ENV: 'development',
        // Missing DATABASE_URL, JWT_SECRET, etc.
      });

      expect(() => service.config).toThrow(/Environment validation failed/);
    });

    it('should provide specific error messages for invalid URLs', () => {
      mockConfigServiceGet({
        ...validBaseConfig,
        FRONTEND_URL: 'not-a-valid-url',
      });

      expect(() => service.config).toThrow();
    });

    it('should provide specific error messages for invalid numbers', () => {
      mockConfigServiceGet({
        ...validBaseConfig,
        PORT: 'not-a-number',
      });

      expect(() => service.config).toThrow();
    });

    it('should validate port range', () => {
      mockConfigServiceGet({
        ...validBaseConfig,
        PORT: '99999', // Above max port
      });

      expect(() => service.config).toThrow();
    });

    it('should validate minimum values for database configuration', () => {
      mockConfigServiceGet({
        ...validBaseConfig,
        DB_MAX_RETRIES: '0', // Below minimum
      });

      expect(() => service.config).toThrow();
    });

    it('should log validation errors', () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error');

      mockConfigServiceGet({
        NODE_ENV: 'development',
        // Missing required fields
      });

      expect(() => service.config).toThrow();
      expect(errorSpy).toHaveBeenCalledWith(
        '❌ Environment validation failed:',
      );
    });
  });

  describe('Configuration Access Methods', () => {
    beforeEach(() => {
      mockConfigServiceGet(validBaseConfig);
    });

    describe('Server Configuration', () => {
      it('should provide server configuration getters', () => {
        expect(service.getPort()).toBe(8080);
        expect(service.getFrontendUrl()).toBe('http://localhost:3000');
      });
    });

    describe('Database Configuration', () => {
      it('should provide database configuration getters', () => {
        expect(service.getDatabaseUrl()).toBe(validBaseConfig.DATABASE_URL);
        expect(service.getDirectUrl()).toBe(validBaseConfig.DIRECT_URL);
        expect(service.getDbMaxRetries()).toBe(3);
        expect(service.getDbRetryDelay()).toBe(1000);
        expect(service.getDbMaxRetryDelay()).toBe(10000);
        expect(service.getDbConnectionTimeout()).toBe(30000);
      });
    });

    describe('JWT Configuration', () => {
      it('should provide JWT configuration getters', () => {
        expect(service.getJwtSecret()).toBe(validBaseConfig.JWT_SECRET);
        expect(service.getJwtExpiresIn()).toBe('1h');
        expect(service.getRefreshTokenExpiresIn()).toBe('7d');
      });

      it('should provide auth config object', () => {
        const authConfig = service.auth;

        expect(authConfig.jwtSecret).toBe('test-jwt-secret-short');
        expect(authConfig.jwtExpiresIn).toBe('1h');
        expect(authConfig.refreshTokenExpiresIn).toBe('7d');
      });
    });

    describe('Supabase Configuration', () => {
      it('should provide Supabase configuration getters', () => {
        expect(service.getSupabaseUrl()).toBe(validBaseConfig.SUPABASE_URL);
        expect(service.getSupabaseKey()).toBe(validBaseConfig.SUPABASE_KEY);
        expect(service.getSupabaseServiceKey()).toBe(
          validBaseConfig.SUPABASE_SERVICE_KEY,
        );
      });
    });

    describe('S3 Configuration', () => {
      it('should provide S3 configuration getters with defaults', () => {
        expect(service.getS3BucketName()).toBe('');
        expect(service.getS3Region()).toBe('us-east-1');
        expect(service.getS3AccessKeyId()).toBe('');
        expect(service.getS3SecretAccessKey()).toBe('');
        expect(service.getS3Endpoint()).toBe('https://s3.amazonaws.com');
      });

      it('should return configured S3 values when provided', () => {
        mockConfigServiceGet({
          ...validBaseConfig,
          S3_BUCKET_NAME: 'test-bucket',
          S3_ACCESS_KEY_ID: 'test-key',
          S3_SECRET_ACCESS_KEY: 'test-secret',
          S3_ENDPOINT: 'https://custom.s3.endpoint.com',
        });

        expect(service.getS3BucketName()).toBe('test-bucket');
        expect(service.getS3AccessKeyId()).toBe('test-key');
        expect(service.getS3SecretAccessKey()).toBe('test-secret');
        expect(service.getS3Endpoint()).toBe('https://custom.s3.endpoint.com');
      });
    });

    describe('OAuth Configuration', () => {
      it('should provide OAuth configuration getters with defaults', () => {
        expect(service.getGoogleOAuthRedirectUrl()).toBe(
          'http://localhost:3000/auth/callback',
        );
      });

      it('should return configured OAuth values when provided', () => {
        mockConfigServiceGet({
          ...validBaseConfig,
          GOOGLE_OAUTH_REDIRECT_URL: 'https://custom.oauth.callback.com',
        });

        expect(service.getGoogleOAuthRedirectUrl()).toBe(
          'https://custom.oauth.callback.com',
        );
      });
    });

    describe('Rate Limiting Configuration', () => {
      it('should provide rate limiting configuration getters', () => {
        expect(service.getThrottleTtl()).toBe(60);
        expect(service.getThrottleLimit()).toBe(10);
      });
    });
  });

  describe('Module Integration', () => {
    it('should validate configuration on module initialization', async () => {
      mockConfigServiceGet(validBaseConfig);

      await service.onModuleInit();

      expect(loggerSpy).toHaveBeenCalledWith(
        '🔍 Validating environment configuration...',
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        '✅ Environment configuration validated successfully',
      );
    });

    it('should not re-validate if already validated', async () => {
      mockConfigServiceGet(validBaseConfig);

      // First call
      await service.onModuleInit();

      // Clear mocks
      jest.clearAllMocks();

      // Second call
      await service.onModuleInit();

      // Should not log validation messages again
      expect(loggerSpy).not.toHaveBeenCalledWith(
        '🔍 Validating environment configuration...',
      );
    });

    it('should validate on-demand if not previously validated', () => {
      mockConfigServiceGet(validBaseConfig);

      // Access config without calling onModuleInit
      const config = service.config;

      expect(config).toBeDefined();
      expect(loggerSpy).toHaveBeenCalledWith(
        '🔍 Validating environment configuration (on-demand)...',
      );
    });
  });

  describe('Type Coercion', () => {
    it('should coerce string numbers to numbers', () => {
      mockConfigServiceGet({
        ...validBaseConfig,
        PORT: '3000',
        DB_MAX_RETRIES: '5',
        THROTTLE_TTL: '120',
        THROTTLE_LIMIT: '50',
      });

      const config = service.config;

      expect(config.server.port).toBe(3000);
      expect(typeof config.server.port).toBe('number');
      expect(config.database.maxRetries).toBe(5);
      expect(config.rateLimit.ttl).toBe(120);
      expect(config.rateLimit.limit).toBe(50);
    });

    it('should handle boolean-like environment flags', () => {
      mockConfigServiceGet(validBaseConfig);

      const config = service.config;

      expect(config.server.isProduction).toBe(false);
      expect(config.server.isDevelopment).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string values appropriately', () => {
      mockConfigServiceGet({
        ...validBaseConfig,
        S3_BUCKET_NAME: '',
        // Don't include GOOGLE_OAUTH_REDIRECT_URL as empty string fails URL validation
      });

      expect(() => service.config).not.toThrow();
    });

    it('should handle undefined values for optional fields', () => {
      mockConfigServiceGet({
        ...validBaseConfig,
        S3_BUCKET_NAME: undefined,
        S3_ACCESS_KEY_ID: undefined,
        GOOGLE_OAUTH_REDIRECT_URL: undefined,
      });

      expect(() => service.config).not.toThrow();
    });

    it('should validate NODE_ENV enum values', () => {
      mockConfigServiceGet({
        ...validBaseConfig,
        NODE_ENV: 'invalid-environment',
      });

      expect(() => service.config).toThrow();
    });
  });

  // Helper function to mock ConfigService.get method
  function mockConfigServiceGet(envVars: Record<string, any>) {
    configService.get.mockImplementation((key: string) => envVars[key]);
  }
});
