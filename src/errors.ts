/**
 * Custom Error Classes
 * Defines application-specific error types with appropriate exit codes.
 *
 * Validates: Requirements 7.1, 7.2, 7.4, 7.5
 */

/**
 * Base error class for the application.
 * All custom errors extend this class.
 */
export class AppError extends Error {
  /**
   * @param message - The error message to display
   * @param exitCode - The process exit code (default: 1)
   * @param isUserFacing - Whether this message should be shown to users (default: true)
   */
  constructor(
    message: string,
    public readonly exitCode: number = 1,
    public readonly isUserFacing: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Error for configuration issues (missing API key, invalid config).
 * Used when the application cannot start due to missing or invalid configuration.
 *
 * Validates: Requirement 9.2 (missing API key error)
 */
export class ConfigError extends AppError {
  constructor(message: string) {
    super(message, 1, true);
    this.name = 'ConfigError';
  }
}

/**
 * Error for user input validation failures.
 * Used when CLI arguments or input parameters are invalid.
 *
 * Validates: Requirements 3.4, 3.5 (date validation errors)
 */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(`Error: ${message}`, 1, true);
    this.name = 'ValidationError';
  }
}

/**
 * Error for API communication failures.
 * Used when the Kiwi API returns an error or network issues occur.
 *
 * Validates: Requirements 7.1, 7.2, 7.4 (API error handling)
 */
export class ApiError extends AppError {
  /**
   * @param message - User-friendly error message
   * @param statusCode - HTTP status code (if applicable)
   * @param originalError - The underlying error that caused this (for logging)
   */
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: Error
  ) {
    super(message, 1, true);
    this.name = 'ApiError';
  }
}

/**
 * Error message constants for consistent messaging across the application.
 * These map to specific HTTP status codes or error conditions.
 */
export const API_ERROR_MESSAGES = {
  /** HTTP 401 - Invalid or missing API key */
  INVALID_API_KEY: 'Error: Invalid API key. Check your RAPIDAPI_KEY environment variable',

  /** HTTP 429 - Rate limit exceeded */
  RATE_LIMIT_EXCEEDED: 'Error: API rate limit exceeded. Please wait a few minutes and try again',

  /** Network timeout or connection failure after retries */
  CONNECTION_FAILED: 'Error: Unable to connect to flight data service. Check your internet connection',

  /** HTTP 5xx - Server-side errors */
  SERVICE_UNAVAILABLE: 'Error: Flight data service temporarily unavailable. Try again later',
} as const;

/**
 * Creates an ApiError from an HTTP status code.
 * Maps status codes to user-friendly error messages.
 *
 * @param statusCode - The HTTP status code
 * @param originalError - The underlying error (for logging)
 * @returns An ApiError with the appropriate message
 */
export function createApiErrorFromStatus(
  statusCode: number,
  originalError?: Error
): ApiError {
  switch (statusCode) {
    case 401:
      return new ApiError(API_ERROR_MESSAGES.INVALID_API_KEY, statusCode, originalError);
    case 429:
      return new ApiError(API_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED, statusCode, originalError);
    case 500:
    case 502:
    case 503:
    case 504:
      return new ApiError(API_ERROR_MESSAGES.SERVICE_UNAVAILABLE, statusCode, originalError);
    default:
      return new ApiError(
        `Error: API request failed with status ${statusCode}`,
        statusCode,
        originalError
      );
  }
}

/**
 * Creates an ApiError for network/connection failures.
 *
 * @param originalError - The underlying network error
 * @returns An ApiError with connection failure message
 */
export function createNetworkError(originalError?: Error): ApiError {
  return new ApiError(API_ERROR_MESSAGES.CONNECTION_FAILED, undefined, originalError);
}
