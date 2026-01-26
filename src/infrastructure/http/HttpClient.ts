import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { Result, ApiError, ok, err } from '../../application/types/index';
import { config } from '../../config/index';
import { logger } from '../logging/Logger';

/**
 * HTTP client configuration
 */
export interface HttpClientConfig {
  baseURL: string;
  timeout: number;
  retryConfig: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    retryableStatuses: number[];
  };
}

/**
 * HTTP client interface
 */
export interface IHttpClient {
  get<T>(url: string, config?: AxiosRequestConfig): Promise<Result<T, ApiError>>;
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<Result<T, ApiError>>;
  setAuthToken(token: string): void;
  clearAuthToken(): void;
}

/**
 * Default HTTP client configuration
 */
const DEFAULT_CONFIG: HttpClientConfig = {
  baseURL: config.zoom.apiBaseUrl,
  timeout: 30000,
  retryConfig: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    retryableStatuses: [429, 500, 502, 503, 504],
  },
};

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(attempt: number, retryAfter?: number, config: HttpClientConfig['retryConfig'] = DEFAULT_CONFIG.retryConfig): number {
  if (retryAfter) {
    return retryAfter * 1000;
  }
  const delay = config.baseDelay * Math.pow(2, attempt);
  return Math.min(delay, config.maxDelay);
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Convert axios error to API error
 */
function axiosErrorToApiError(error: AxiosError): ApiError {
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data as Record<string, unknown> | undefined;
    const message = (data?.message as string) || error.message;

    switch (status) {
      case 400:
        return {
          type: 'VALIDATION_ERROR',
          message,
          details: data?.errors as ApiError extends { type: 'VALIDATION_ERROR' } ? ApiError['details'] : undefined,
        };
      case 401:
        return { type: 'AUTH_ERROR', message };
      case 403:
        return {
          type: 'PERMISSION_ERROR',
          message,
          requiredScopes: data?.required_scopes as string[] | undefined,
        };
      case 404:
        return {
          type: 'NOT_FOUND',
          message,
          resourceType: 'unknown',
          resourceId: 'unknown',
        };
      case 429:
        const retryAfter = parseInt(error.response.headers['retry-after'] || '60', 10);
        return {
          type: 'RATE_LIMITED',
          message: 'Rate limit exceeded',
          retryAfter,
        };
      default:
        return {
          type: 'SERVER_ERROR',
          message,
          statusCode: status,
        };
    }
  }

  if (error.request) {
    return {
      type: 'NETWORK_ERROR',
      message: error.message || 'Network error occurred',
      cause: error,
    };
  }

  return {
    type: 'NETWORK_ERROR',
    message: error.message || 'Unknown error occurred',
    cause: error,
  };
}

/**
 * HTTP client implementation with retry logic
 */
export class HttpClient implements IHttpClient {
  private readonly client: AxiosInstance;
  private readonly config: HttpClientConfig;
  private authToken: string | null = null;

  constructor(httpConfig?: Partial<HttpClientConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...httpConfig };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
    });

    this.setupInterceptors();
  }

  /**
   * Setup request/response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }

        logger.debug('HTTP Request', {
          method: config.method?.toUpperCase(),
          url: config.url,
          baseURL: config.baseURL,
        });

        return config;
      },
      (error) => {
        logger.error('Request error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug('HTTP Response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error) => {
        logger.error('Response error', error as Error, {
          status: error.response?.status,
          url: error.config?.url,
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Set authentication token
   */
  setAuthToken(token: string): void {
    this.authToken = token;
    logger.debug('Auth token set');
  }

  /**
   * Clear authentication token
   */
  clearAuthToken(): void {
    this.authToken = null;
    logger.debug('Auth token cleared');
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<AxiosResponse<T>>
  ): Promise<Result<T, ApiError>> {
    let lastError: AxiosError | null = null;

    for (let attempt = 0; attempt <= this.config.retryConfig.maxRetries; attempt++) {
      try {
        const response = await requestFn();
        return ok(response.data);
      } catch (error) {
        lastError = error as AxiosError;

        if (!axios.isAxiosError(lastError)) {
          return err({
            type: 'NETWORK_ERROR',
            message: 'Unknown error occurred',
            cause: lastError as Error,
          });
        }

        const status = lastError.response?.status;

        // Check if error is retryable
        if (
          status &&
          this.config.retryConfig.retryableStatuses.includes(status) &&
          attempt < this.config.retryConfig.maxRetries
        ) {
          const retryAfter = status === 429
            ? parseInt(lastError.response?.headers['retry-after'] || '0', 10)
            : undefined;

          const delay = calculateDelay(attempt, retryAfter, this.config.retryConfig);

          logger.warn(`Request failed, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            maxRetries: this.config.retryConfig.maxRetries,
            status,
          });

          await sleep(delay);
          continue;
        }

        // Non-retryable error or max retries reached
        break;
      }
    }

    return err(axiosErrorToApiError(lastError!));
  }

  /**
   * GET request
   */
  async get<T>(url: string, requestConfig?: AxiosRequestConfig): Promise<Result<T, ApiError>> {
    return this.executeWithRetry(() => this.client.get<T>(url, requestConfig));
  }

  /**
   * POST request
   */
  async post<T>(url: string, data?: unknown, requestConfig?: AxiosRequestConfig): Promise<Result<T, ApiError>> {
    return this.executeWithRetry(() => this.client.post<T>(url, data, requestConfig));
  }

  /**
   * Get raw axios instance for streaming downloads
   */
  getRawClient(): AxiosInstance {
    return this.client;
  }
}

/**
 * Default HTTP client instance
 */
export const httpClient = new HttpClient();

export default httpClient;
