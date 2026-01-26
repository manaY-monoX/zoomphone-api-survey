import { RecordingService } from '../../../src/application/services/RecordingService';
import { IHttpClient, HttpClient } from '../../../src/infrastructure/http/HttpClient';
import { IFileStorage } from '../../../src/infrastructure/storage/FileStorage';
import { OAuthService } from '../../../src/application/services/OAuthService';
import { ApiError } from '../../../src/application/types';

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

describe('RecordingService', () => {
  let recordingService: RecordingService;
  let mockHttpClient: jest.Mocked<IHttpClient> & { getRawClient: jest.Mock };
  let mockFileStorage: jest.Mocked<IFileStorage>;
  let mockOAuthService: jest.Mocked<OAuthService>;

  const mockRecording = {
    id: 'recording-1',
    call_log_id: 'call-log-1',
    caller_number: '+1234567890',
    callee_number: '+0987654321',
    date_time: '2024-01-15T10:00:00Z',
    end_date_time: '2024-01-15T10:02:00Z',
    duration: 120,
    download_url: 'https://zoom.us/recording/download/abc123def456',
    file_type: 'MP3',
    file_size: 1024000,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    const mockRawClient = {
      get: jest.fn(),
    };

    mockHttpClient = {
      get: jest.fn(),
      post: jest.fn(),
      setAuthToken: jest.fn(),
      clearAuthToken: jest.fn(),
      getRawClient: jest.fn().mockReturnValue(mockRawClient),
    } as unknown as jest.Mocked<IHttpClient> & { getRawClient: jest.Mock };

    mockFileStorage = {
      save: jest.fn().mockResolvedValue('/recordings/test-file.mp3'),
      exists: jest.fn().mockResolvedValue(false),
      getPath: jest.fn().mockReturnValue('/recordings/test-file.mp3'),
      ensureDirectory: jest.fn().mockResolvedValue(undefined),
    };

    mockOAuthService = {
      getAccessToken: jest.fn().mockResolvedValue({
        success: true,
        data: 'test-access-token',
      }),
    } as unknown as jest.Mocked<OAuthService>;

    recordingService = new RecordingService(
      mockHttpClient as unknown as HttpClient,
      mockFileStorage,
      mockOAuthService
    );
  });

  describe('getRecordings', () => {
    it('should fetch recordings successfully', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        success: true,
        data: {
          recordings: [mockRecording],
          next_page_token: undefined,
        },
      });

      const result = await recordingService.getRecordings('user@example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.recordings).toHaveLength(1);
        expect(result.data.recordings[0].id).toBe('recording-1');
        expect(result.data.recordings[0].downloadUrl).toBe(
          'https://zoom.us/recording/download/abc123def456'
        );
      }
    });

    it('should return auth error when not authenticated', async () => {
      mockOAuthService.getAccessToken.mockResolvedValueOnce({
        success: false,
        error: { type: 'TOKEN_EXPIRED', message: 'Not authenticated' },
      });

      const result = await recordingService.getRecordings('user@example.com');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('AUTH_ERROR');
      }
    });

    it('should handle API errors', async () => {
      const apiError: ApiError = {
        type: 'SERVER_ERROR',
        message: 'Internal server error',
        statusCode: 500,
      };

      mockHttpClient.get.mockResolvedValueOnce({
        success: false,
        error: apiError,
      });

      const result = await recordingService.getRecordings('user@example.com');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('SERVER_ERROR');
      }
    });
  });

  describe('extractDownloadKey', () => {
    it('should extract download key from valid URL', () => {
      const url = 'https://zoom.us/recording/download/abc123def456';
      const key = recordingService.extractDownloadKey(url);

      expect(key).toBe('abc123def456');
    });

    it('should decode URL-encoded keys', () => {
      const url = 'https://zoom.us/recording/download/abc%20123';
      const key = recordingService.extractDownloadKey(url);

      expect(key).toBe('abc 123');
    });

    it('should throw error for invalid URL', () => {
      expect(() => {
        recordingService.extractDownloadKey('invalid-url');
      }).toThrow('Invalid download URL');
    });
  });

  describe('downloadRecording', () => {
    it('should download recording successfully', async () => {
      const mockBuffer = Buffer.from('audio data');

      mockHttpClient.getRawClient().get.mockResolvedValueOnce({
        data: mockBuffer,
        headers: { 'content-type': 'audio/mpeg' },
      });

      const result = await recordingService.downloadRecording(
        'https://zoom.us/recording/download/abc123',
        'test-recording.mp3'
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.filePath).toBe('/recordings/test-file.mp3');
        expect(result.data.mimeType).toBe('audio/mpeg');
      }

      expect(mockFileStorage.save).toHaveBeenCalled();
    });

    it('should return auth error when not authenticated', async () => {
      mockOAuthService.getAccessToken.mockResolvedValueOnce({
        success: false,
        error: { type: 'TOKEN_EXPIRED', message: 'Not authenticated' },
      });

      const result = await recordingService.downloadRecording(
        'https://zoom.us/recording/download/abc123',
        'test-recording.mp3'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('AUTH_ERROR');
      }
    });

    it('should handle 404 error', async () => {
      mockHttpClient.getRawClient().get.mockRejectedValueOnce({
        response: {
          status: 404,
          data: { message: 'Recording not found' },
        },
      });

      const result = await recordingService.downloadRecording(
        'https://zoom.us/recording/download/abc123',
        'test-recording.mp3'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });

    it('should handle network errors', async () => {
      mockHttpClient.getRawClient().get.mockRejectedValueOnce({
        message: 'Network Error',
      });

      const result = await recordingService.downloadRecording(
        'https://zoom.us/recording/download/abc123',
        'test-recording.mp3'
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NETWORK_ERROR');
      }
    });
  });
});
