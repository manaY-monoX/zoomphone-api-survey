import { OAuthService } from '../../../src/application/services/OAuthService';
import { ITokenStore } from '../../../src/infrastructure/storage/TokenStore';
import { TokenData } from '../../../src/application/types';

// Mock axios
jest.mock('axios');
import axios from 'axios';
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock config
jest.mock('../../../src/config/index', () => ({
  config: {
    zoom: {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      redirectUri: 'http://localhost:3000/oauth/callback',
      apiBaseUrl: 'https://api.zoom.us/v2',
    },
    webhook: {
      port: 3001,
      secretToken: 'test-secret',
    },
    logging: {
      level: 'error',
    },
    storage: {
      recordingsOutputDir: './recordings',
    },
  },
}));

// Mock logger
jest.mock('../../../src/infrastructure/logging/Logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('OAuthService', () => {
  let oauthService: OAuthService;
  let mockTokenStore: jest.Mocked<ITokenStore>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockTokenStore = {
      save: jest.fn().mockResolvedValue(undefined),
      load: jest.fn().mockResolvedValue(null),
      clear: jest.fn().mockResolvedValue(undefined),
      isExpired: jest.fn().mockReturnValue(false),
      getTimeUntilExpiry: jest.fn().mockReturnValue(3600000),
    };

    oauthService = new OAuthService(mockTokenStore);
  });

  describe('getAuthorizationUrl', () => {
    it('should generate a valid authorization URL', () => {
      const state = 'test-state-123';
      const url = oauthService.getAuthorizationUrl(state);

      expect(url).toContain('https://zoom.us/oauth/authorize');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('state=test-state-123');
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=');
    });

    it('should include required scopes', () => {
      const url = oauthService.getAuthorizationUrl('state');

      expect(url).toContain('phone%3Aread%3Alist_call_logs%3Aadmin');
      expect(url).toContain('phone%3Aread%3Acall_log%3Aadmin');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for token successfully', async () => {
      const mockResponse = {
        data: {
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'phone:read:list_call_logs:admin',
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await oauthService.exchangeCodeForToken('auth-code-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessToken).toBe('test-access-token');
        expect(result.data.refreshToken).toBe('test-refresh-token');
        expect(result.data.expiresAt).toBeInstanceOf(Date);
      }

      expect(mockTokenStore.save).toHaveBeenCalled();
    });

    it('should return error for invalid code', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          data: { reason: 'Invalid authorization code' },
        },
      });

      const result = await oauthService.exchangeCodeForToken('invalid-code');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('INVALID_CODE');
      }
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const existingToken: TokenData = {
        accessToken: 'old-access-token',
        refreshToken: 'old-refresh-token',
        expiresAt: Date.now() + 3600000,
      };

      mockTokenStore.load.mockResolvedValueOnce(existingToken);

      const mockResponse = {
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'phone:read:list_call_logs:admin',
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await oauthService.refreshToken();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.accessToken).toBe('new-access-token');
        expect(result.data.refreshToken).toBe('new-refresh-token');
      }

      expect(mockTokenStore.save).toHaveBeenCalled();
    });

    it('should return error when no refresh token available', async () => {
      mockTokenStore.load.mockResolvedValueOnce(null);

      const result = await oauthService.refreshToken();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('REFRESH_FAILED');
      }
    });
  });

  describe('getAccessToken', () => {
    it('should return existing token if not expired', async () => {
      const existingToken: TokenData = {
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: Date.now() + 3600000,
      };

      mockTokenStore.load.mockResolvedValueOnce(existingToken);
      mockTokenStore.isExpired.mockReturnValueOnce(false);

      const result = await oauthService.getAccessToken();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('valid-access-token');
      }
    });

    it('should auto-refresh token if expired', async () => {
      const expiredToken: TokenData = {
        accessToken: 'expired-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: Date.now() - 1000,
      };

      mockTokenStore.load.mockResolvedValue(expiredToken);
      mockTokenStore.isExpired.mockReturnValueOnce(true);

      const mockResponse = {
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'phone:read:list_call_logs:admin',
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const result = await oauthService.getAccessToken();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('new-access-token');
      }
    });

    it('should return error when not authenticated', async () => {
      mockTokenStore.load.mockResolvedValueOnce(null);

      const result = await oauthService.getAccessToken();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('TOKEN_EXPIRED');
      }
    });
  });

  describe('isAuthenticated', () => {
    it('should return false when no token', () => {
      expect(oauthService.isAuthenticated()).toBe(false);
    });
  });

  describe('logout', () => {
    it('should clear token store', async () => {
      oauthService.logout();

      expect(mockTokenStore.clear).toHaveBeenCalled();
      expect(oauthService.isAuthenticated()).toBe(false);
    });
  });
});
