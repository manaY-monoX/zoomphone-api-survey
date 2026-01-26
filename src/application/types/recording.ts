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
  fileType: string;
  fileSize: number;
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
 */
export interface IRecordingService {
  getRecordings(userId: string): Promise<Result<RecordingListResponse, ApiError>>;
  downloadRecording(downloadUrl: string, outputPath: string): Promise<Result<DownloadResult, ApiError>>;
  extractDownloadKey(downloadUrl: string): string;
}
