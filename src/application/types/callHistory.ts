import { Result, ApiError } from './common';

/**
 * Parameters for call history query
 */
export interface CallHistoryParams {
  from?: string;        // Start date (YYYY-MM-DD)
  to?: string;          // End date (YYYY-MM-DD)
  pageSize?: number;    // Page size (max 300)
  nextPageToken?: string;
}

/**
 * Call history response
 */
export interface CallHistoryResponse {
  callLogs: CallLog[];
  nextPageToken?: string;
  totalRecords: number;
}

/**
 * Call log entry
 */
export interface CallLog {
  id: string;
  callId: string;
  callerNumber: string;
  calleeNumber: string;
  direction: 'inbound' | 'outbound';
  duration: number;
  startTime: string;
  endTime: string;
  result: string;
  hasRecording: boolean;
}

/**
 * Call path segment
 */
export interface CallPathSegment {
  id: string;
  type: string;
  number: string;
  time: string;
  duration: number;
}

/**
 * Recording info in call history detail
 */
export interface RecordingInfo {
  id: string;
  downloadUrl: string;
  fileType: string;
  fileSize: number;
}

/**
 * Call history detail with path and recording info
 */
export interface CallHistoryDetail extends CallLog {
  callPath: CallPathSegment[];
  recording?: RecordingInfo;
}

/**
 * Call history service interface
 */
export interface ICallHistoryService {
  getCallHistory(params: CallHistoryParams): Promise<Result<CallHistoryResponse, ApiError>>;
  getCallHistoryDetail(callLogId: string): Promise<Result<CallHistoryDetail, ApiError>>;
  getAllCallHistory(params: CallHistoryParams): AsyncGenerator<CallLog, void, unknown>;
}
