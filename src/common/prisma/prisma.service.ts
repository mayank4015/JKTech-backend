import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, Prisma } from '@prisma/client';
import retry from 'p-retry';

@Injectable()
export class PrismaService
  extends PrismaClient<
    Prisma.PrismaClientOptions,
    'query' | 'info' | 'warn' | 'error'
  >
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private configService: ConfigService) {
    super({
      datasources: {
        db: {
          url: configService.get('DATABASE_URL'),
        },
      },
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event',
          level: 'error',
        },
        {
          emit: 'event',
          level: 'info',
        },
        {
          emit: 'event',
          level: 'warn',
        },
      ],
    });

    // Log database queries in development
    if (process.env.NODE_ENV === 'development') {
      this.$on('query', (e: Prisma.QueryEvent) => {
        this.logger.debug(
          `Query: ${e.query} -- Params: ${e.params} -- Duration: ${e.duration}ms`,
        );
      });
    }

    // Log errors
    this.$on('error', (e: Prisma.LogEvent) => {
      this.logger.error('Database error:', e);
    });

    // Log info
    this.$on('info', (e: Prisma.LogEvent) => {
      this.logger.log(`Database info: ${e.message}`);
    });

    // Log warnings
    this.$on('warn', (e: Prisma.LogEvent) => {
      this.logger.warn(`Database warning: ${e.message}`);
    });
  }

  async onModuleInit() {
    this.logger.log('Connecting to database...');

    const maxRetries = this.configService.get<number>('DB_MAX_RETRIES', 3);
    const retryDelay = this.configService.get<number>('DB_RETRY_DELAY', 1000);
    const maxRetryDelay = this.configService.get<number>(
      'DB_MAX_RETRY_DELAY',
      10000,
    );

    try {
      await retry(
        async () => {
          await this.$connect();
          this.logger.log('Successfully connected to database');
        },
        {
          retries: maxRetries,
          factor: 2,
          minTimeout: retryDelay,
          maxTimeout: maxRetryDelay,
          onFailedAttempt: (error) => {
            this.logger.warn(
              `Database connection attempt ${error.attemptNumber} failed. ${
                error.retriesLeft > 0
                  ? `Retrying in ${error.attemptNumber * retryDelay}ms...`
                  : 'No more retries left.'
              }`,
            );
          },
        },
      );

      // Test the connection with a simple query
      await this.$queryRaw`SELECT 1`;
      this.logger.log('Database connection test successful');
    } catch (error) {
      this.logger.error('Failed to connect to database:', error);
      throw new Error(
        `Database connection failed after ${maxRetries} attempts: ${error.message}`,
      );
    }
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }

  /**
   * Health check method to verify database connectivity
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return false;
    }
  }

  /**
   * Transaction helper with automatic retry on serialization failures
   */
  async executeTransaction<T>(
    fn: (tx: PrismaClient) => Promise<T>,
    maxRetries = 3,
  ): Promise<T> {
    return await retry(
      async () => {
        return await this.$transaction(fn, {
          timeout: 10000, // 10 seconds
        });
      },
      {
        retries: maxRetries,
        factor: 2,
        minTimeout: 100,
        maxTimeout: 5000,
        shouldRetry: (error) => {
          // Only retry on serialization failures and deadlocks
          const isRetryableError =
            (error instanceof Prisma.PrismaClientKnownRequestError &&
              (error.code === 'P2034' || // Serialization failure
                error.code === 'P2025' || // Record not found (might be due to concurrent transactions)
                error.code === 'P2002')) || // Unique constraint (might be due to concurrent transactions)
            error.message?.includes('serialization failure') ||
            error.message?.includes('deadlock');

          if (isRetryableError) {
            this.logger.warn(
              `Transaction failed with retryable error: ${error.message}. Retrying...`,
            );
          }

          return isRetryableError;
        },
        onFailedAttempt: (error) => {
          this.logger.warn(
            `Transaction attempt ${error.attemptNumber} failed. ${
              error.retriesLeft > 0
                ? `Retrying in ${error.attemptNumber * 100}ms...`
                : 'No more retries left.'
            }`,
          );
        },
      },
    );
  }
}
