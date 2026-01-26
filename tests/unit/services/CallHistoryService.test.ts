import { CallHistoryService } from '../../../src/application/services/CallHistoryService';
import { IHttpClient } from '../../../src/infrastructure/http/HttpClient';
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

describe('CallHistoryService', () => {
  let callHistoryService: CallHistoryService;
  let mockHttpClient: jest.Mocked<IHttpClient>;
  let mockOAuthService: jest.Mocked<OAuthService>;

  const mockCallLog = {
    id: 'call-log-1',
    call_id: 'call-1',
    caller_number: '+1234567890',
    callee_number: '+0987654321',
    direction: 'outbound' as const,
    duration: 120,
    date_time: '2024-01-15T10:00:00Z',
    end_date_time: '2024-01-15T10:02:00Z',
    result: 'Answered',
    has_recording: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockHttpClient = {
      get: jest.fn(),
      post: jest.fn(),
      setAuthToken: jest.fn(),
      clearAuthToken: jest.fn(),
    } as unknown as jest.Mocked<IHttpClient>;

    mockOAuthService = {
      getAccessToken: jest.fn().mockResolvedValue({
        success: true,
        data: 'test-access-token',
      }),
    } as unknown as jest.Mocked<OAuthService>;

    callHistoryService = new CallHistoryService(mockHttpClient, mockOAuthService);
  });

  describe('getCallHistory', () => {
    it('should fetch call history successfully', async () => {
      const mockResponse = {
        call_logs: [mockCallLog],
        next_page_token: undefined,
        total_records: 1,
      };

      mockHttpClient.get.mockResolvedValueOnce({
        success: true,
        data: mockResponse,
      });

      const result = await callHistoryService.getCallHistory({
        from: '2024-01-01',
        to: '2024-01-31',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.callLogs).toHaveLength(1);
        expect(result.data.callLogs[0].id).toBe('call-log-1');
        expect(result.data.callLogs[0].callerNumber).toBe('+1234567890');
        expect(result.data.totalRecords).toBe(1);
      }
    });

    it('should handle date range filtering', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        success: true,
        data: { call_logs: [], total_records: 0 },
      });

      await callHistoryService.getCallHistory({
        from: '2024-01-01',
        to: '2024-01-31',
        pageSize: 100,
      });

      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('from=2024-01-01')
      );
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('to=2024-01-31')
      );
      expect(mockHttpClient.get).toHaveBeenCalledWith(
        expect.stringContaining('page_size=100')
      );
    });

    it('should return auth error when not authenticated', async () => {
      mockOAuthService.getAccessToken.mockResolvedValueOnce({
        success: false,
        error: { type: 'TOKEN_EXPIRED', message: 'Not authenticated' },
      });

      const result = await callHistoryService.getCallHistory({});

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

      const result = await callHistoryService.getCallHistory({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('SERVER_ERROR');
      }
    });
  });

  describe('getCallHistoryDetail', () => {
    it('should fetch call detail successfully', async () => {
      const mockDetail = {
        ...mockCallLog,
        call_path: [
          {
            id: 'path-1',
            type: 'extension',
            number: '100',
            time: '2024-01-15T10:00:00Z',
            duration: 60,
          },
        ],
        recording: {
          id: 'recording-1',
          download_url: 'https://zoom.us/recording/download/abc123',
          file_type: 'MP3',
          file_size: 1024000,
        },
      };

      mockHttpClient.get.mockResolvedValueOnce({
        success: true,
        data: mockDetail,
      });

      const result = await callHistoryService.getCallHistoryDetail('call-log-1');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('call-log-1');
        expect(result.data.callPath).toHaveLength(1);
        expect(result.data.recording).toBeDefined();
        expect(result.data.recording?.id).toBe('recording-1');
      }
    });

    it('should handle not found error', async () => {
      const notFoundError: ApiError = {
        type: 'NOT_FOUND',
        message: 'Call log not found',
        resourceType: 'unknown',
        resourceId: 'unknown',
      };

      mockHttpClient.get.mockResolvedValueOnce({
        success: false,
        error: notFoundError,
      });

      const result = await callHistoryService.getCallHistoryDetail('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('NOT_FOUND');
      }
    });
  });

  describe('getAllCallHistory', () => {
    it('should iterate through all pages', async () => {
      // First page
      mockHttpClient.get.mockResolvedValueOnce({
        success: true,
        data: {
          call_logs: [mockCallLog],
          next_page_token: 'page-2-token',
          total_records: 2,
        },
      });

      // Second page
      mockHttpClient.get.mockResolvedValueOnce({
        success: true,
        data: {
          call_logs: [{ ...mockCallLog, id: 'call-log-2' }],
          next_page_token: undefined,
          total_records: 2,
        },
      });

      const callLogs = [];
      for await (const log of callHistoryService.getAllCallHistory({})) {
        callLogs.push(log);
      }

      expect(callLogs).toHaveLength(2);
      expect(callLogs[0].id).toBe('call-log-1');
      expect(callLogs[1].id).toBe('call-log-2');
    });

    it('should throw error on API failure', async () => {
      mockHttpClient.get.mockResolvedValueOnce({
        success: false,
        error: {
          type: 'SERVER_ERROR',
          message: 'Server error',
          statusCode: 500,
        },
      });

      const generator = callHistoryService.getAllCallHistory({});

      await expect(generator.next()).rejects.toThrow('Failed to fetch call history');
    });
  });
});
