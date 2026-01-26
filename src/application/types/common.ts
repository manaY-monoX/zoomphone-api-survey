/**
 * Result type for handling success/failure cases
 */
export type Result<T, E> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Helper function to create a success result
 */
export function ok<T, E>(data: T): Result<T, E> {
  return { success: true, data };
}

/**
 * Helper function to create a failure result
 */
export function err<T, E>(error: E): Result<T, E> {
  return { success: false, error };
}

/**
 * API error types
 */
export type ApiError =
  | { type: 'VALIDATION_ERROR'; message: string; details?: ValidationDetail[] }
  | { type: 'AUTH_ERROR'; message: string }
  | { type: 'PERMISSION_ERROR'; message: string; requiredScopes?: string[] }
  | { type: 'NOT_FOUND'; message: string; resourceType: string; resourceId: string }
  | { type: 'RATE_LIMITED'; message: string; retryAfter: number }
  | { type: 'SERVER_ERROR'; message: string; statusCode: number }
  | { type: 'NETWORK_ERROR'; message: string; cause?: Error };

export interface ValidationDetail {
  field: string;
  message: string;
}
