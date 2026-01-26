import axios from 'axios';
import {
  Result,
  TokenPair,
  TokenData,
  AuthError,
  IOAuthService,
  ok,
  err,
} from '../types/index';
import { config } from '../../config/index';
import { TokenStore, ITokenStore } from '../../infrastructure/storage/TokenStore';
import { logger } from '../../infrastructure/logging/Logger';

/**
 * Zoom OAuth endpoints
 */
const OAUTH_ENDPOINTS = {
  authorize: 'https://zoom.us/oauth/authorize',
  token: 'https://zoom.us/oauth/token',
} as const;

/**
 * Required OAuth scopes for Zoom Phone API
 * Note: User-level scopes provide access to the authenticated user's data.
 * For account-wide access, :admin suffix scopes are required but need admin account privileges.
 */
const REQUIRED_SCOPES = [
  'phone:read:list_call_logs',
  'phone:read:call_log',
  'phone:read:list_recordings',
  'phone:read:call_recording',
] as const;

/**
 * OAuth token response from Zoom
 */
interface ZoomTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

/**
 * OAuth service implementation
 */
export class OAuthService implements IOAuthService {
  private readonly tokenStore: ITokenStore;
  private cachedToken: TokenData | null = null;

  constructor(tokenStore?: ITokenStore) {
    this.tokenStore = tokenStore || new TokenStore();
  }

  /**
   * Generate authorization URL for OAuth flow
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.zoom.clientId,
      redirect_uri: config.zoom.redirectUri,
      state,
      scope: REQUIRED_SCOPES.join(' '),
    });

    const url = `${OAUTH_ENDPOINTS.authorize}?${params.toString()}`;

    logger.debug('Generated authorization URL', {
      clientId: config.zoom.clientId,
      redirectUri: config.zoom.redirectUri,
      scopes: REQUIRED_SCOPES,
    });

    return url;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForToken(code: string): Promise<Result<TokenPair, AuthError>> {
    logger.info('Exchanging authorization code for token');

    try {
      const credentials = Buffer.from(
        `${config.zoom.clientId}:${config.zoom.clientSecret}`
      ).toString('base64');

      const response = await axios.post<ZoomTokenResponse>(
        OAUTH_ENDPOINTS.token,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.zoom.redirectUri,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${credentials}`,
          },
        }
      );

      const tokenPair = this.responseToTokenPair(response.data);

      // Save token to store
      const tokenData: TokenData = {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresAt: tokenPair.expiresAt.getTime(),
      };

      await this.tokenStore.save(tokenData);
      this.cachedToken = tokenData;

      logger.info('Token exchange successful', {
        expiresAt: tokenPair.expiresAt.toISOString(),
        scopes: response.data.scope,
      });

      return ok(tokenPair);
    } catch (error) {
      const axiosError = error as { response?: { data?: { reason?: string } }; message?: string };
      const message = axiosError.response?.data?.reason || axiosError.message || 'Unknown error';

      logger.error('Token exchange failed', error as Error);

      return err({
        type: 'INVALID_CODE',
        message: `Failed to exchange code: ${message}`,
      });
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(): Promise<Result<TokenPair, AuthError>> {
    logger.info('Refreshing access token');

    // Load token from store if not cached
    if (!this.cachedToken) {
      this.cachedToken = await this.tokenStore.load();
    }

    if (!this.cachedToken?.refreshToken) {
      return err({
        type: 'REFRESH_FAILED',
        message: 'No refresh token available',
      });
    }

    try {
      const credentials = Buffer.from(
        `${config.zoom.clientId}:${config.zoom.clientSecret}`
      ).toString('base64');

      const response = await axios.post<ZoomTokenResponse>(
        OAUTH_ENDPOINTS.token,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.cachedToken.refreshToken,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${credentials}`,
          },
        }
      );

      const tokenPair = this.responseToTokenPair(response.data);

      // Save new token to store
      const tokenData: TokenData = {
        accessToken: tokenPair.accessToken,
        refreshToken: tokenPair.refreshToken,
        expiresAt: tokenPair.expiresAt.getTime(),
      };

      await this.tokenStore.save(tokenData);
      this.cachedToken = tokenData;

      logger.info('Token refresh successful', {
        expiresAt: tokenPair.expiresAt.toISOString(),
      });

      return ok(tokenPair);
    } catch (error) {
      const axiosError = error as { response?: { data?: { reason?: string } }; message?: string };
      const message = axiosError.response?.data?.reason || axiosError.message || 'Unknown error';

      logger.error('Token refresh failed', error as Error);

      return err({
        type: 'REFRESH_FAILED',
        message: `Failed to refresh token: ${message}`,
      });
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getAccessToken(): Promise<Result<string, AuthError>> {
    // Load token from store if not cached
    if (!this.cachedToken) {
      this.cachedToken = await this.tokenStore.load();
    }

    if (!this.cachedToken) {
      return err({
        type: 'TOKEN_EXPIRED',
        message: 'No token available. Please authenticate first.',
      });
    }

    // Check if token needs refresh
    if (this.tokenStore.isExpired(this.cachedToken)) {
      logger.info('Token expired or about to expire, refreshing');

      const refreshResult = await this.refreshToken();

      if (!refreshResult.success) {
        return err(refreshResult.error);
      }

      return ok(refreshResult.data.accessToken);
    }

    return ok(this.cachedToken.accessToken);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.cachedToken !== null && !this.tokenStore.isExpired(this.cachedToken);
  }

  /**
   * Logout (clear tokens)
   */
  logout(): void {
    this.cachedToken = null;
    this.tokenStore.clear().catch((error) => {
      logger.error('Failed to clear token store', error as Error);
    });

    logger.info('Logged out successfully');
  }

  /**
   * Load token from store (for initialization)
   */
  async loadToken(): Promise<void> {
    this.cachedToken = await this.tokenStore.load();

    if (this.cachedToken) {
      logger.debug('Token loaded from store', {
        expiresAt: new Date(this.cachedToken.expiresAt).toISOString(),
      });
    }
  }

  /**
   * Convert Zoom token response to TokenPair
   */
  private responseToTokenPair(response: ZoomTokenResponse): TokenPair {
    const expiresAt = new Date(Date.now() + response.expires_in * 1000);

    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt,
    };
  }
}

/**
 * Default OAuth service instance
 */
export const oauthService = new OAuthService();

export default oauthService;
