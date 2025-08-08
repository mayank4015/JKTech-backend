import {
  User,
  Session,
  AuthError,
  AuthTokenResponsePassword,
  AuthResponse,
} from '@supabase/supabase-js';
import { JwtPayload, AuthTokens } from './auth.types';

/**
 * Test utility types for better type safety in tests
 */

export interface MockUser {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Use actual Supabase types for better compatibility
export type SupabaseSignInResponse = AuthTokenResponsePassword;
export type SupabaseSignUpResponse = AuthResponse;

export interface SupabaseSignOutResponse {
  error: AuthError | null;
}

export interface TestUtils {
  createMockUser: (overrides?: Partial<MockUser>) => MockUser;
  createMockJwtPayload: (overrides?: Partial<JwtPayload>) => JwtPayload;
  createMockAuthTokens: () => AuthTokens;
  createMockSupabaseUser: (overrides?: Partial<User>) => User;
  createMockSession: (user: User) => Session;
  createMockAuthError: (message: string) => AuthError;
}

declare global {
  var testUtils: TestUtils;
}
