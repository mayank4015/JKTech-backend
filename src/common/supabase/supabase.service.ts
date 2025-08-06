import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import pRetry, { AbortError } from 'p-retry';

// Define user interface for type safety
interface User {
  id: string;
  email?: string;
  created_at?: string;
  // Add other user fields as needed
  [key: string]: unknown; // For any additional fields
}

interface SupabaseError {
  message: string;
  code?: string;
  error_code?: string;
}

interface UserMetadata {
  [key: string]: string | number | boolean | null;
}

interface SignUpOptions {
  data?: UserMetadata;
}

/**
 * Service for interacting with Supabase
 *
 * This service provides methods to interact with Supabase services,
 * including authentication and database operations.
 */
@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;
  private readonly logger = new Logger(SupabaseService.name);

  constructor() {
    // Initialize Supabase client with environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        'Supabase URL and key must be provided in environment variables',
      );
    }

    // Create Supabase client with enhanced configuration
    this.supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false, // Disable session persistence for server-side usage
      },
      global: {
        headers: {
          'x-client-info': 'isp-saas-backend',
        },
      },
      db: {
        schema: 'public',
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });

    this.logger.log('Supabase client initialized successfully');
  }

  /**
   * Get the Supabase client instance
   * @returns SupabaseClient instance
   */
  getClient(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Execute a database operation with retry logic using p-retry
   * @param operation Function that returns a Promise with the database operation
   * @param options Retry options (optional)
   * @returns Promise with the operation result
   */
  async executeWithRetry<T>(
    operation: () => Promise<{ data: T | null; error: unknown }>,
    options?: {
      retries?: number;
      minTimeout?: number;
      maxTimeout?: number;
      factor?: number;
      randomize?: boolean;
    },
  ): Promise<{ data: T | null; error: unknown }> {
    const defaultOptions = {
      retries: parseInt(process.env.DB_MAX_RETRIES || '3'),
      minTimeout: parseInt(process.env.DB_RETRY_DELAY || '1000'),
      maxTimeout: parseInt(process.env.DB_MAX_RETRY_DELAY || '10000'),
      factor: 2, // Exponential backoff factor
      randomize: true, // Add jitter to prevent thundering herd
    };

    const retryOptions = { ...defaultOptions, ...options };

    try {
      return await pRetry(
        async (attemptNumber) => {
          this.logger.debug(
            `Executing database operation (attempt ${attemptNumber}/${retryOptions.retries + 1})`,
          );

          const result = await operation();

          if (result.error) {
            // Don't retry on certain types of errors
            if (this.isNonRetryableError(result.error)) {
              this.logger.debug('Error is non-retryable, not attempting retry');
              // Abort retries by throwing an AbortError
              const errorMessage = this.extractErrorMessage(result.error);
              throw new AbortError(errorMessage);
            }

            const errorMessage = this.extractErrorMessage(result.error);

            this.logger.warn(
              `Database operation failed on attempt ${attemptNumber}: ${errorMessage}`,
            );

            // Throw error to trigger retry
            throw new Error(errorMessage);
          }

          if (attemptNumber > 1) {
            this.logger.log(
              `Database operation succeeded on attempt ${attemptNumber}`,
            );
          }

          return result;
        },
        {
          retries: retryOptions.retries,
          minTimeout: retryOptions.minTimeout,
          maxTimeout: retryOptions.maxTimeout,
          factor: retryOptions.factor,
          randomize: retryOptions.randomize,
          onFailedAttempt: (error) => {
            this.logger.warn(
              `Attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left. Error: ${error.message}`,
            );
          },
        },
      );
    } catch (error) {
      // If it's an AbortError, return the original error
      if (error instanceof AbortError) {
        this.logger.error(
          `Non-retryable error: ${error.originalError.message}`,
        );
        return { data: null, error: error.originalError };
      }

      // For other errors, log and return
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `All retry attempts failed. Final error: ${errorMessage}`,
      );
      return { data: null, error };
    }
  }

  /**
   * Extract error message from unknown error type
   * @param error The error to extract message from
   * @returns Error message string
   */
  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (this.isSupabaseError(error)) {
      return error.message;
    }

    return String(error);
  }

  /**
   * Type guard to check if error is a Supabase error
   * @param error Unknown error object
   * @returns True if error matches SupabaseError interface
   */
  private isSupabaseError(error: unknown): error is SupabaseError {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as SupabaseError).message === 'string'
    );
  }

  /**
   * Check if an error should not be retried
   * @param error The error to check
   * @returns true if the error should not be retried
   */
  private isNonRetryableError(error: unknown): boolean {
    if (!error) return false;

    const nonRetryableCodes = [
      'PGRST116', // Not found
      'PGRST301', // Unauthorized
      '42501', // Insufficient privilege
      '23505', // Unique violation
      '23503', // Foreign key violation
      '23502', // Not null violation
      '22001', // String data right truncation
    ];

    let errorCode = '';
    let errorMessage = '';

    if (this.isSupabaseError(error)) {
      errorCode = error.code || error.error_code || '';
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }

    // Check for specific error codes
    if (
      errorCode &&
      errorCode !== '' &&
      nonRetryableCodes.includes(errorCode)
    ) {
      return true;
    }

    // Check for authentication errors
    if (
      errorMessage.toLowerCase().includes('authentication') ||
      errorMessage.toLowerCase().includes('unauthorized') ||
      errorMessage.toLowerCase().includes('permission')
    ) {
      return true;
    }

    return false;
  }

  /**
   * Check the health of the Supabase connection
   * @returns Promise with connection status
   */
  async checkConnectionHealth(): Promise<{ healthy: boolean; error?: string }> {
    try {
      this.logger.debug('Checking Supabase connection health');

      // Try a simple query to test the connection
      const { error } = await this.supabase
        .from('zones')
        .select('count')
        .limit(1);

      if (error) {
        this.logger.warn(`Connection health check failed: ${error.message}`);
        return { healthy: false, error: error.message };
      }

      this.logger.debug('Connection health check passed');
      return { healthy: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Connection health check error: ${errorMessage}`);
      return { healthy: false, error: errorMessage };
    }
  }

  /**
   * Sign in a user with email and password
   * @param email User's email
   * @param password User's password
   * @returns Supabase auth response
   */
  async signIn(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({
      email,
      password,
    });
  }

  /**
   * Sign up a new user with email and password
   * @param email User's email
   * @param password User's password
   * @param metadata Additional user metadata (optional)
   * @returns Supabase auth response
   */
  async signUp(email: string, password: string, metadata?: UserMetadata) {
    const options: SignUpOptions = {};

    if (metadata) {
      options.data = metadata;
    }

    return this.supabase.auth.signUp({
      email,
      password,
      ...(Object.keys(options).length > 0 && { options }),
    });
  }

  /**
   * Sign out a user
   * @returns Supabase auth response
   */
  async signOut() {
    return this.supabase.auth.signOut();
  }

  /**
   * Get Google OAuth URL
   * @param redirectTo URL to redirect to after authentication
   * @returns URL to redirect the user to for Google OAuth
   */
  getGoogleAuthUrl(redirectTo?: string) {
    // Use the frontend URL directly as the redirect URL
    // This way Supabase will redirect directly to your frontend with the token
    const redirectUrl =
      redirectTo || process.env.FRONTEND_URL + '/auth/callback';

    return this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });
  }

  /**
   * Get user by ID
   * @param userId User ID
   * @returns User data
   */
  async getUserById(userId: string): Promise<User | null> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single<User>();

    if (error) {
      throw error;
    }

    return data;
  }

  /**
   * Get user information from an OAuth token
   * @param token OAuth access token
   * @returns User data and any error
   */
  async getUserFromToken(token: string) {
    try {
      // Validate token format
      if (!token || typeof token !== 'string' || token.length < 10) {
        return {
          data: null,
          error: new Error('Invalid token format'),
        };
      }

      // Set the auth token for this request
      try {
        await this.supabase.auth.setSession({
          access_token: token,
          refresh_token: '',
        });
      } catch (sessionError) {
        console.error('Error setting Supabase session:', sessionError);
        return {
          data: null,
          error: new Error('Failed to set authentication session'),
        };
      }

      // Get user data
      const { data, error } = await this.supabase.auth.getUser();

      if (error) {
        console.error('Supabase getUser error:', error);
        return { data: null, error };
      }

      if (!data || !data.user) {
        return {
          data: null,
          error: new Error(
            'No user data returned from authentication provider',
          ),
        };
      }

      return { data: data.user, error: null };
    } catch (error: unknown) {
      console.error('Unexpected error in getUserFromToken:', error);
      return {
        data: null,
        error:
          error instanceof Error ? error : new Error('Unknown error occurred'),
      };
    }
  }
}
