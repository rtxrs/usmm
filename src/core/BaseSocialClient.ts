import { logger } from '../utils/logger.js';

/**
 * BaseSocialClient provides shared retry logic for all social media clients.
 * Handles rate limiting (429), transient errors (500, 503), and exponential backoff.
 */
export abstract class BaseSocialClient {
  protected platformName: string;

  constructor(platformName: string) {
    this.platformName = platformName;
  }

  /**
   * Executes a function with automatic retry on transient errors.
   * @param fn The function to execute
   * @param retries Number of retry attempts remaining
   * @param delay Initial delay in ms (doubles on each retry)
   * @returns Promise resolving to the function's result
   */
  protected async requestWithRetry<T>(
    fn: () => Promise<T>, 
    retries: number = 3, 
    delay: number = 3000
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const statusCode = error.response?.status;
      const errorCode = error.response?.data?.error?.code;
      
      // Handle rate limiting (429)
      if (statusCode === 429) {
        const retryAfter = error.response?.headers?.['retry-after'] || 
                          error.response?.data?.retry_after ||
                          60;
        logger.warn(`${this.platformName} API rate limited. Waiting ${retryAfter}s before retry...`, { 
          retryAfter 
        });
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        if (retries > 0) {
          return this.requestWithRetry(fn, retries - 1, delay);
        }
      }
      
      // Retry on 500 (Internal Server Error), 503 (Service Unavailable), or API-specific transient codes
      const shouldRetry = this.shouldRetryOnError(statusCode, errorCode, error);
      
      if (retries > 0 && shouldRetry) {
        const errorDescription = `Status: ${statusCode}, Code: ${errorCode}`;
        logger.warn(`${this.platformName} API transient error (${errorDescription}). Retrying...`, { 
          retriesLeft: retries 
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.requestWithRetry(fn, retries - 1, delay * 2);
      }
      
      throw error;
    }
  }

  /**
   * Determine if an error should trigger a retry.
   * Can be overridden by subclasses for platform-specific logic.
   */
  protected shouldRetryOnError(statusCode: number | undefined, errorCode: number | undefined, error: any): boolean {
    // Default: retry on transient server errors (500, 502, 503, 504), timeout (408), and unknown errors
    const transientStatuses = [408, 500, 502, 503, 504];
    return statusCode === undefined || transientStatuses.includes(statusCode);
  }

  /**
   * Helper to handle and log errors consistently across platforms.
   */
  protected handleApiError(error: any, context: string = ''): void {
    const statusCode = error.response?.status;
    const errorData = error.response?.data;
    
    logger.error(`${this.platformName} API Error${context ? ` (${context})` : ''}`, { 
      status: statusCode, 
      data: errorData,
      message: error.message,
    });
  }
}
