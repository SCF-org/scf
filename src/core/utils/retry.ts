/**
 * Retry utility with exponential backoff
 */

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay between retries in milliseconds */
  initialDelayMs: number;
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Error messages/codes that are retryable (if empty, all errors are retryable) */
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Check if an error is retryable based on the options
 */
function isRetryableError(error: Error, retryableErrors?: string[]): boolean {
  if (!retryableErrors || retryableErrors.length === 0) {
    return true;
  }

  const errorMessage = error.message || '';
  const errorName = error.name || '';

  return retryableErrors.some(
    (e) => errorMessage.includes(e) || errorName.includes(e)
  );
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an operation with retry logic and exponential backoff
 *
 * @param operation - Async function to execute
 * @param options - Retry configuration options
 * @param onRetry - Optional callback called before each retry
 * @returns The result of the operation
 * @throws The last error if all retries are exhausted
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  onRetry?: (attempt: number, error: Error, delayMs: number) => void
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_OPTIONS, ...options };
  const { maxRetries, initialDelayMs, maxDelayMs, backoffMultiplier, retryableErrors } = opts;

  let lastError: Error | undefined;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If this was the last attempt, don't retry
      if (attempt === maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(lastError, retryableErrors)) {
        throw lastError;
      }

      // Call onRetry callback if provided
      onRetry?.(attempt + 1, lastError, delay);

      // Wait before retrying
      await sleep(delay);

      // Calculate next delay with exponential backoff
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Common AWS retryable error patterns
 */
export const AWS_RETRYABLE_ERRORS = {
  S3: ['ServiceUnavailable', 'InternalError', 'SlowDown', 'RequestTimeout'],
  CloudFront: ['Throttling', 'TooManyInvalidationsInProgress', 'ServiceException'],
  Route53: ['Throttling', 'PriorRequestNotComplete', 'ServiceException'],
  ACM: ['Throttling', 'RequestInProgressException', 'ServiceException'],
  General: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'NetworkingError'],
};
