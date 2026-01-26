import {
  Result,
  ApiError,
  RecordingListResponse,
  Recording,
  DownloadResult,
  IRecordingService,
  ok,
  err,
} from '../types/index';
import { HttpClient, IHttpClient } from '../../infrastructure/http/HttpClient';
import { FileStorage, IFileStorage } from '../../infrastructure/storage/FileStorage';
import { OAuthService } from './OAuthService';
import { logger } from '../../infrastructure/logging/Logger';

/**
 * Zoom API response for recordings list
 */
interface ZoomRecordingListResponse {
  recordings: ZoomRecording[];
  next_page_token?: string;
}

/**
 * Zoom API recording entry
 * Note: User-level endpoint returns different field names than documented
 */
interface ZoomRecording {
  id: string;
  call_log_id: string;
  caller_number: string;
  callee_number: string;
  date_time: string;
  end_date_time?: string;   // Admin endpoint
  end_time?: string;        // User endpoint
  duration: number;
  download_url: string;
  file_type?: string;       // Not always present in user endpoint
  file_size?: number;       // Not always present in user endpoint
  recording_type?: string;  // 'OnDemand' | 'Automatic'
}

/**
 * Recording service implementation
 */
export class RecordingService implements IRecordingService {
  private readonly httpClient: HttpClient;
  private readonly fileStorage: IFileStorage;
  private readonly oauthService: OAuthService;

  constructor(
    httpClient?: IHttpClient,
    fileStorage?: IFileStorage,
    oauthService?: OAuthService
  ) {
    this.httpClient = (httpClient || new HttpClient()) as HttpClient;
    this.fileStorage = fileStorage || new FileStorage();
    this.oauthService = oauthService || new OAuthService();
  }

  /**
   * Get recordings list
   * Uses user-level endpoint (/phone/users/me/recordings) for user-scoped access
   * Admin-level endpoint (/phone/recordings) requires :admin scopes
   */
  async getRecordings(_userId?: string): Promise<Result<RecordingListResponse, ApiError>> {
    logger.info('Fetching recordings (user-level endpoint)');

    // Get access token
    const tokenResult = await this.oauthService.getAccessToken();
    if (!tokenResult.success) {
      return err({
        type: 'AUTH_ERROR',
        message: tokenResult.error.message,
      });
    }

    this.httpClient.setAuthToken(tokenResult.data);

    // Use user-level endpoint for user-scoped access
    const url = `/phone/users/me/recordings`;

    const result = await this.httpClient.get<ZoomRecordingListResponse>(url);

    if (!result.success) {
      return result;
    }

    // Debug: Log raw response structure for user-level endpoint
    logger.debug('Raw recordings API response', { data: result.data });

    // User-level endpoint may return different structure
    // Handle both 'recordings' (admin) and potential variations
    const recordings = result.data.recordings ||
      (result.data as unknown as { recording_list?: ZoomRecording[] }).recording_list ||
      (result.data as unknown as { call_recordings?: ZoomRecording[] }).call_recordings ||
      [];

    const response: RecordingListResponse = {
      recordings: recordings.map(this.mapRecording),
      nextPageToken: result.data.next_page_token,
    };

    logger.info('Recordings fetched successfully', {
      count: response.recordings.length,
      hasNextPage: !!response.nextPageToken,
    });

    return ok(response);
  }

  /**
   * Extract download_url_key from download URL
   */
  extractDownloadKey(downloadUrl: string): string {
    try {
      const url = new URL(downloadUrl);
      const pathParts = url.pathname.split('/');
      const key = pathParts[pathParts.length - 1];

      if (!key) {
        throw new Error('No download key found in URL');
      }

      // Decode if URL-encoded
      return decodeURIComponent(key);
    } catch (error) {
      logger.error('Failed to extract download key', error as Error, { downloadUrl });
      throw new Error(`Invalid download URL: ${downloadUrl}`);
    }
  }

  /**
   * Download recording file
   */
  async downloadRecording(
    downloadUrl: string,
    outputPath: string
  ): Promise<Result<DownloadResult, ApiError>> {
    logger.info('Downloading recording', { downloadUrl, outputPath });

    // Get access token
    const tokenResult = await this.oauthService.getAccessToken();
    if (!tokenResult.success) {
      return err({
        type: 'AUTH_ERROR',
        message: tokenResult.error.message,
      });
    }

    try {
      // Extract download key from URL
      const downloadKey = this.extractDownloadKey(downloadUrl);

      // Set auth token
      this.httpClient.setAuthToken(tokenResult.data);

      // Download file using streaming
      const response = await this.httpClient.getRawClient().get(
        `/phone/recording/download/${downloadKey}`,
        {
          responseType: 'arraybuffer',
          timeout: 300000, // 5 minutes for large files
        }
      );

      const buffer = Buffer.from(response.data);
      const mimeType = response.headers['content-type'] || 'audio/mpeg';

      // Save to file
      const filePath = await this.fileStorage.save(outputPath, buffer);

      const result: DownloadResult = {
        filePath,
        fileSize: buffer.length,
        mimeType,
      };

      logger.info('Recording downloaded successfully', {
        filePath,
        fileSize: result.fileSize,
        mimeType: result.mimeType,
      });

      return ok(result);
    } catch (error) {
      const axiosError = error as { response?: { status?: number; data?: { message?: string } }; message?: string };

      if (axiosError.response) {
        const status = axiosError.response.status;
        const message = axiosError.response.data?.message || axiosError.message || 'Unknown error';

        if (status === 404) {
          return err({
            type: 'NOT_FOUND',
            message: `Recording not found: ${message}`,
            resourceType: 'Recording',
            resourceId: downloadUrl,
          });
        }

        return err({
          type: 'SERVER_ERROR',
          message: `Download failed: ${message}`,
          statusCode: status || 500,
        });
      }

      return err({
        type: 'NETWORK_ERROR',
        message: `Network error during download: ${axiosError.message}`,
        cause: error as Error,
      });
    }
  }

  /**
   * Map Zoom recording to internal format
   * Handles differences between admin and user-level endpoint responses
   */
  private mapRecording(zoom: ZoomRecording): Recording {
    // User endpoint uses 'end_time', admin uses 'end_date_time'
    const endTime = zoom.end_time || zoom.end_date_time || '';

    return {
      id: zoom.id,
      callLogId: zoom.call_log_id,
      callerNumber: zoom.caller_number,
      calleeNumber: zoom.callee_number,
      startTime: zoom.date_time,
      endTime,
      duration: zoom.duration,
      downloadUrl: zoom.download_url,
      fileType: zoom.file_type,
      fileSize: zoom.file_size,
      recordingType: zoom.recording_type,
    };
  }
}

/**
 * Default recording service instance
 */
export const recordingService = new RecordingService();

export default recordingService;
