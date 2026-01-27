/**
 * Retry utility with exponential backoff
 */

export interface RetryOptions {
	maxRetries?: number;
	initialDelayMs?: number;
	maxDelayMs?: number;
	backoffMultiplier?: number;
	retryableErrors?: (error: any) => boolean;
	onRetry?: (attempt: number, error: any, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'retryableErrors' | 'onRetry'>> = {
	maxRetries: 3,
	initialDelayMs: 1000,
	maxDelayMs: 30000,
	backoffMultiplier: 2
};

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Add jitter to delay to prevent thundering herd
 */
function addJitter(delayMs: number): number {
	// Add +/- 20% jitter
	const jitterFactor = 0.8 + Math.random() * 0.4;
	return Math.floor(delayMs * jitterFactor);
}

/**
 * Default function to determine if an error is retryable
 */
function defaultRetryable(error: any): boolean {
	// Retry on rate limits (429)
	if (error?.status === 429 || error?.statusCode === 429) return true;

	// Retry on server errors (5xx)
	const status = error?.status || error?.statusCode;
	if (status && status >= 500 && status < 600) return true;

	// Retry on network errors
	if (error?.code === 'ETIMEDOUT' || error?.code === 'ECONNRESET') return true;
	if (error?.type === 'NETWORK' || error?.type === 'TIMEOUT') return true;

	// Retry on model overloaded
	if (error?.type === 'MODEL_OVERLOADED') return true;

	return false;
}

/**
 * Execute a function with exponential backoff retry
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {}
): Promise<T> {
	const opts = {
		...DEFAULT_OPTIONS,
		...options,
		retryableErrors: options.retryableErrors || defaultRetryable
	};

	let lastError: any;
	let delayMs = opts.initialDelayMs;

	for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;

			// Check if we've exhausted retries
			if (attempt > opts.maxRetries) {
				throw error;
			}

			// Check if error is retryable
			if (!opts.retryableErrors(error)) {
				throw error;
			}

			// Calculate delay with jitter
			const actualDelay = addJitter(Math.min(delayMs, opts.maxDelayMs));

			// Log retry attempt
			if (opts.onRetry) {
				opts.onRetry(attempt, error, actualDelay);
			} else {
				console.log(
					`[Retry] Attempt ${attempt}/${opts.maxRetries} failed, retrying in ${actualDelay}ms...`,
					error?.message || error
				);
			}

			// Wait before retrying
			await sleep(actualDelay);

			// Increase delay for next attempt
			delayMs *= opts.backoffMultiplier;
		}
	}

	throw lastError;
}

/**
 * Create a retryable version of a function
 */
export function makeRetryable<T extends (...args: any[]) => Promise<any>>(
	fn: T,
	options: RetryOptions = {}
): T {
	return ((...args: Parameters<T>) => withRetry(() => fn(...args), options)) as T;
}
