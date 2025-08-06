export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  name: string;
  iat?: number;
  exp?: number;
}

/**
 * Authentication tokens interface
 * Contains access and refresh tokens
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface UserData {
  id: string;
  email: string;
  name: string;
  role?: string | null;
}
