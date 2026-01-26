import { Result } from './common';

/**
 * Token pair returned from OAuth flow
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * Token data for storage
 */
export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
}

/**
 * Authentication state
 */
export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  isAuthenticated: boolean;
}

/**
 * Authentication error types
 */
export type AuthError =
  | { type: 'INVALID_CODE'; message: string }
  | { type: 'TOKEN_EXPIRED'; message: string }
  | { type: 'REFRESH_FAILED'; message: string }
  | { type: 'NETWORK_ERROR'; message: string };

/**
 * OAuth service interface
 */
export interface IOAuthService {
  getAuthorizationUrl(state: string): string;
  exchangeCodeForToken(code: string): Promise<Result<TokenPair, AuthError>>;
  getAccessToken(): Promise<Result<string, AuthError>>;
  refreshToken(): Promise<Result<TokenPair, AuthError>>;
  isAuthenticated(): boolean;
  logout(): void;
}
