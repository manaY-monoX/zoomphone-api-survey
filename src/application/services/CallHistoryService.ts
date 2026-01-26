import {
  Result,
  ApiError,
  CallHistoryParams,
  CallHistoryResponse,
  CallHistoryDetail,
  CallLog,
  CallPathSegment,
  RecordingInfo,
  ICallHistoryService,
  ok,
  err,
} from '../types/index';
import { HttpClient, IHttpClient } from '../../infrastructure/http/HttpClient';
import { OAuthService } from './OAuthService';
import { logger } from '../../infrastructure/logging/Logger';

/**
 * Zoom API response for call history list
 */
interface ZoomCallHistoryResponse {
  call_logs: ZoomCallLog[];
  next_page_token?: string;
  total_records: number;
}

/**
 * Zoom API call log entry
 */
interface ZoomCallLog {
  id: string;
  call_id: string;
  caller_number: string;
  callee_number: string;
  direction: 'inbound' | 'outbound';
  duration: number;
  date_time: string;
  end_date_time: string;
  result: string;
  has_recording: boolean;
}

/**
 * Zoom API response for call history detail
 */
interface ZoomCallHistoryDetailResponse {
  id: string;
  call_id: string;
  caller_number: string;
  callee_number: string;
  direction: 'inbound' | 'outbound';
  duration: number;
  date_time: string;
  end_date_time: string;
  result: string;
  has_recording: boolean;
  call_path?: ZoomCallPathSegment[];
  recording?: ZoomRecordingInfo;
}

interface ZoomCallPathSegment {
  id: string;
  type: string;
  number: string;
  time: string;
  duration: number;
}

interface ZoomRecordingInfo {
  id: string;
  download_url: string;
  file_type: string;
  file_size: number;
}

/**
 * Delay between pagination requests (ms)
 */
const PAGINATION_DELAY_MS = 500;

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call history service implementation
 */
export class CallHistoryService implements ICallHistoryService {
  private readonly httpClient: IHttpClient;
  private readonly oauthService: OAuthService;

  constructor(httpClient?: IHttpClient, oauthService?: OAuthService) {
    this.httpClient = httpClient || new HttpClient();
    this.oauthService = oauthService || new OAuthService();
  }

  /**
   * Get call history list
   */
  async getCallHistory(params: CallHistoryParams): Promise<Result<CallHistoryResponse, ApiError>> {
    logger.info('Fetching call history', { params });

    // Get access token
    const tokenResult = await this.oauthService.getAccessToken();
    if (!tokenResult.success) {
      return err({
        type: 'AUTH_ERROR',
        message: tokenResult.error.message,
      });
    }

    (this.httpClient as HttpClient).setAuthToken(tokenResult.data);

    // Build query parameters
    const queryParams = new URLSearchParams();
    if (params.from) queryParams.append('from', params.from);
    if (params.to) queryParams.append('to', params.to);
    if (params.pageSize) queryParams.append('page_size', params.pageSize.toString());
    if (params.nextPageToken) queryParams.append('next_page_token', params.nextPageToken);

    // Use user-level endpoint (/phone/users/me/call_logs) for user-scoped access
    // Admin-level endpoint (/phone/call_history) requires :admin scopes
    const url = `/phone/users/me/call_logs${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

    const result = await this.httpClient.get<ZoomCallHistoryResponse>(url);

    if (!result.success) {
      return result;
    }

    // Debug: Log raw response structure for user-level endpoint
    logger.debug('Raw API response', { data: result.data });

    // User-level endpoint may return different structure
    // Handle both 'call_logs' (admin) and potential variations
    const callLogs = result.data.call_logs || (result.data as unknown as { call_log?: ZoomCallLog[] }).call_log || [];

    const response: CallHistoryResponse = {
      callLogs: callLogs.map(this.mapCallLog),
      nextPageToken: result.data.next_page_token,
      totalRecords: result.data.total_records,
    };

    logger.info('Call history fetched successfully', {
      count: response.callLogs.length,
      totalRecords: response.totalRecords,
      hasNextPage: !!response.nextPageToken,
    });

    return ok(response);
  }

  /**
   * Get call history detail
   */
  async getCallHistoryDetail(callLogId: string): Promise<Result<CallHistoryDetail, ApiError>> {
    logger.info('Fetching call history detail', { callLogId });

    // Get access token
    const tokenResult = await this.oauthService.getAccessToken();
    if (!tokenResult.success) {
      return err({
        type: 'AUTH_ERROR',
        message: tokenResult.error.message,
      });
    }

    (this.httpClient as HttpClient).setAuthToken(tokenResult.data);

    // Use user-level endpoint for user-scoped access
    const result = await this.httpClient.get<ZoomCallHistoryDetailResponse>(
      `/phone/users/me/call_logs/${callLogId}`
    );

    if (!result.success) {
      if (result.error.type === 'NOT_FOUND') {
        return err({
          ...result.error,
          resourceType: 'CallLog',
          resourceId: callLogId,
        });
      }
      return result;
    }

    const detail = this.mapCallHistoryDetail(result.data);

    logger.info('Call history detail fetched successfully', {
      callLogId,
      hasRecording: !!detail.recording,
    });

    return ok(detail);
  }

  /**
   * Get all call history with pagination (AsyncGenerator)
   */
  async *getAllCallHistory(params: CallHistoryParams): AsyncGenerator<CallLog, void, unknown> {
    logger.info('Starting paginated call history fetch', { params });

    let nextPageToken: string | undefined = params.nextPageToken;
    let pageCount = 0;

    do {
      const result = await this.getCallHistory({
        ...params,
        nextPageToken,
      });

      if (!result.success) {
        logger.error('Failed to fetch call history page', undefined, {
          pageCount,
          error: result.error,
        });
        throw new Error(`Failed to fetch call history: ${result.error.message}`);
      }

      pageCount++;

      for (const callLog of result.data.callLogs) {
        yield callLog;
      }

      nextPageToken = result.data.nextPageToken;

      // Delay between pages to avoid rate limiting
      if (nextPageToken) {
        await sleep(PAGINATION_DELAY_MS);
      }
    } while (nextPageToken);

    logger.info('Completed paginated call history fetch', { pageCount });
  }

  /**
   * Map Zoom call log to internal format
   */
  private mapCallLog(zoom: ZoomCallLog): CallLog {
    return {
      id: zoom.id,
      callId: zoom.call_id,
      callerNumber: zoom.caller_number,
      calleeNumber: zoom.callee_number,
      direction: zoom.direction,
      duration: zoom.duration,
      startTime: zoom.date_time,
      endTime: zoom.end_date_time,
      result: zoom.result,
      hasRecording: zoom.has_recording,
    };
  }

  /**
   * Map Zoom call history detail to internal format
   */
  private mapCallHistoryDetail(zoom: ZoomCallHistoryDetailResponse): CallHistoryDetail {
    const base = this.mapCallLog(zoom);

    const callPath: CallPathSegment[] = (zoom.call_path || []).map(segment => ({
      id: segment.id,
      type: segment.type,
      number: segment.number,
      time: segment.time,
      duration: segment.duration,
    }));

    let recording: RecordingInfo | undefined;
    if (zoom.recording) {
      recording = {
        id: zoom.recording.id,
        downloadUrl: zoom.recording.download_url,
        fileType: zoom.recording.file_type,
        fileSize: zoom.recording.file_size,
      };
    }

    return {
      ...base,
      callPath,
      recording,
    };
  }
}

/**
 * Default call history service instance
 */
export const callHistoryService = new CallHistoryService();

export default callHistoryService;
