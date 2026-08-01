/**
 * Retry Handler
 * Implements exponential backoff retry logic for API calls.
 *
 * Validates: Requirements 7.3, 7.4
 * - IF a network timeout occurs (>30 seconds), THEN retry up to 3 times with exponential backoff (1s, 2s, 4s delays)
 * - IF all retries fail, THEN display "Error: Unable to connect to flight data service. Check your internet connection"
 */

import { ApiError, createNetworkError } from '../errors.js';

/**
 * Configuration options for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts: number;
  /** Base delay in milliseconds before first retry (default: 1000) */
  baseDelayMs: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
  /** HTTP status codes that should trigger a retry */
  retryableStatusCodes: number[];
}

/**
 * Interface for retry handler implementations.
 */
export interface IRetryHandler {
  /**
   * Execute operation with exponential backoff retry.
   * @param operation - Async function to execute
   * @param config - Optional partial retry configuration
   * @throws After maxAttempts failures
   */
  withRetry<T>(
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>
  ): Promise<T>;
}

/**
 * Default configuration for retry behavior.
 * - 3 attempts total
 * - 1 second base delay
 * - Exponential backoff: 1s, 2s, 4s
 * - Retries on timeout (408), rate limit (429), and server errors (500, 502, 503, 504)
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

/**
 * Checks if an error is retryable based on its status code.
 * @param error - The error to check
 * @param retryableStatusCodes - List of status codes that are retryable
 * @returns True if the error is retryable
 */
export function isRetryableError(
  error: unknown,
  retryableStatusCodes: number[]
): boolean {
  // Network errors (no response) are retryable
  if (error instanceof Error && !('statusCode' in error)) {
    // Check for network-related error messages
    const message = error.message.toLowerCase();
    if (
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('enotfound')
    ) {
      return true;
    }
  }

  // Check for status code on ApiError or similar errors
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode: number }).statusCode;
    return retryableStatusCodes.includes(statusCode);
  }

  // Check for axios-style errors with response.status
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'status' in error.response
  ) {
    const statusCode = (error.response as { status: number }).status;
    return retryableStatusCodes.includes(statusCode);
  }

  return false;
}

/**
 * Calculates the delay for a given retry attempt using exponential backoff.
 * Formula: delay = baseDelay * 2^(attempt-1)
 *
 * For default config (baseDelay=1000, multiplier=2):
 * - Attempt 1: 1000ms (1s)
 * - Attempt 2: 2000ms (2s)
 * - Attempt 3: 4000ms (4s)
 *
 * @param attempt - The current attempt number (1-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param backoffMultiplier - Multiplier for exponential growth
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  backoffMultiplier: number
): number {
  return baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
}

/**
 * Delays execution for the specified number of milliseconds.
 * @param ms - Milliseconds to delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry handler that executes operations with exponential backoff.
 */
export class RetryHandler implements IRetryHandler {
  private readonly config: RetryConfig;

  /**
   * Creates a new RetryHandler with the given default configuration.
   * @param config - Optional partial configuration to override defaults
   */
  constructor(config?: Partial<RetryConfig>) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Execute an async operation with exponential backoff retry.
   *
   * The retry logic works as follows:
   * 1. Execute the operation
   * 2. If successful, return the result
   * 3. If failed with a retryable error and attempts remain:
   *    - Wait for backoff delay: baseDelay * 2^(attempt-1)
   *    - Retry the operation
   * 4. If failed with non-retryable error or max attempts reached, throw
   *
   * @param operation - Async function to execute
   * @param config - Optional partial configuration to override instance defaults
   * @returns The result of the successful operation
   * @throws The last error if all retries fail
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    config?: Partial<RetryConfig>
  ): Promise<T> {
    const effectiveConfig = { ...this.config, ...config };
    const { maxAttempts, baseDelayMs, backoffMultiplier, retryableStatusCodes } =
      effectiveConfig;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Check if we should retry
        const shouldRetry =
          attempt < maxAttempts &&
          isRetryableError(error, retryableStatusCodes);

        if (!shouldRetry) {
          throw error;
        }

        // Calculate and wait for backoff delay
        const delayMs = calculateBackoffDelay(
          attempt,
          baseDelayMs,
          backoffMultiplier
        );
        await delay(delayMs);
      }
    }

    // All retries exhausted - throw network error with connection message
    // This satisfies requirement 7.4: display "Error: Unable to connect to flight data service..."
    if (lastError instanceof ApiError) {
      throw lastError;
    }

    throw createNetworkError(lastError instanceof Error ? lastError : undefined);
  }
}

/**
 * Default retry handler instance for convenience.
 */
export const defaultRetryHandler = new RetryHandler();

/**
 * Convenience function to execute an operation with retry using default handler.
 * @param operation - Async function to execute
 * @param config - Optional partial configuration
 * @returns The result of the successful operation
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  return defaultRetryHandler.withRetry(operation, config);
}
