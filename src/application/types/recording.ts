import { Result, ApiError } from './common';

/**
 * Recording list response
 */
export interface RecordingListResponse {
  recordings: Recording[];
  nextPageToken?: string;
}

/**
 * Recording entry
 * Note: fileType and fileSize may not be available from user-level endpoint
 */
export interface Recording {
  id: string;
  callLogId: string;
  callerNumber: string;
  calleeNumber: string;
  startTime: string;
  endTime: string;
  duration: number;
  downloadUrl: string;
  fileType?: string;       // May not be present in user-level endpoint
  fileSize?: number;       // May not be present in user-level endpoint
  recordingType?: string;  // 'OnDemand' | 'Automatic'
}

/**
 * Download result
 */
export interface DownloadResult {
  filePath: string;
  fileSize: number;
  mimeType: string;
}

/**
 * Recording service interface
 * Note: userId is optional as user-level endpoint (/phone/users/me/recordings) doesn't require it
 */
export interface IRecordingService {
  getRecordings(userId?: string): Promise<Result<RecordingListResponse, ApiError>>;
  downloadRecording(downloadUrl: string, outputPath: string): Promise<Result<DownloadResult, ApiError>>;
  extractDownloadKey(downloadUrl: string): string;
}
