/**
 * Jest Test Setup
 * Global test configuration and mocks
 */

// Mock Supabase client before any imports
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
      getUser: jest.fn(),
    },
  })),
}));

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.REFRESH_TOKEN_EXPIRES_IN = '7d';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock Date.now for consistent testing
const mockDate = new Date('2024-01-01T00:00:00.000Z');
// Only mock Date.now, not the Date constructor to preserve instanceof checks
Date.now = jest.fn(() => mockDate.getTime());

// Import types for better type safety
import type { MockUser, TestUtils } from '../src/auth/types/test.types';
import type { JwtPayload, AuthTokens } from '../src/auth/types/auth.types';
import type { User, Session, AuthError } from '@supabase/supabase-js';

// Global test utilities
global.testUtils = {
  createMockUser: (overrides: Partial<MockUser> = {}): MockUser => ({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    role: 'admin',
    isActive: true,
    createdAt: mockDate,
    updatedAt: mockDate,
    ...overrides,
  }),

  createMockJwtPayload: (overrides: Partial<JwtPayload> = {}): JwtPayload => ({
    sub: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    role: 'admin',
    iat: Math.floor(mockDate.getTime() / 1000),
    exp: Math.floor(mockDate.getTime() / 1000) + 3600,
    ...overrides,
  }),

  createMockAuthTokens: (): AuthTokens => ({
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
  }),

  createMockSupabaseUser: (overrides: Partial<User> = {}): User =>
    ({
      id: 'test-user-id',
      aud: 'authenticated',
      email: 'test@example.com',
      created_at: mockDate.toISOString(),
      user_metadata: { name: 'Test User' },
      app_metadata: { provider: 'email', providers: ['email'] },
      role: 'authenticated',
      updated_at: mockDate.toISOString(),
      email_confirmed_at: mockDate.toISOString(),
      last_sign_in_at: mockDate.toISOString(),
      ...overrides,
    }) as User,

  createMockSession: (user: User): Session =>
    ({
      access_token: 'mock-access-token',
      refresh_token: 'mock-refresh-token',
      expires_in: 3600,
      expires_at: Math.floor(mockDate.getTime() / 1000) + 3600,
      token_type: 'bearer',
      user,
    }) as Session,

  createMockAuthError: (message: string): AuthError =>
    ({
      message,
      name: 'AuthError',
      status: 400,
      code: 'auth_error',
      __isAuthError: true,
    }) as unknown as AuthError,
};

// Extend global types
export {};
