import { EXA_API_KEY } from '$env/static/private';
import { ExaError, ExaErrorType, type SearchResponse } from '$lib/types/exa';
import { withRetry } from '$lib/utils/retry';

export class ExaWrapper {
	private apiKey: string;
	private baseUrl = 'https://api.exa.ai';

	constructor() {
		if (!EXA_API_KEY) {
			throw new Error('EXA_API_KEY environment variable is required');
		}
		this.apiKey = EXA_API_KEY;
	}

	// Direct fetch for true parallel execution (no shared client state)
	// Exa uses cursor-based pagination, not offset
	// Set includeText=false for cheaper search, then use getContents for unique URLs
	async searchPeople(
		query: string,
		options?: { numResults?: number; cursor?: string; includeText?: boolean }
	): Promise<SearchResponse> {
		// Exa max is 100 results per request
		const numResults = Math.min(options?.numResults || 100, 100);
		const includeText = options?.includeText ?? false; // Default to NO text (cheaper)

		return withRetry(
			async () => {
				const requestBody: Record<string, unknown> = {
					query,
					category: 'people',
					numResults,
					type: 'auto'
				};

				// Only include text if explicitly requested (costs extra $0.001/result)
				if (includeText) {
					requestBody.text = true;
					requestBody.contents = { text: true };
				}

				// Add cursor for pagination if provided
				if (options?.cursor) {
					requestBody.cursor = options.cursor;
				}

				const response = await fetch(`${this.baseUrl}/search`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-api-key': this.apiKey
					},
					body: JSON.stringify(requestBody)
				});

				if (!response.ok) {
					const error = await response.json().catch(() => ({}));
					throw this.handleError({ status: response.status, message: error.message || response.statusText });
				}

				return await response.json() as SearchResponse;
			},
			{
				maxRetries: 3,
				initialDelayMs: 1000,
				retryableErrors: (error) => {
					// Retry on rate limits, server errors, and network issues
					if (error instanceof ExaError) {
						return [ExaErrorType.RATE_LIMIT, ExaErrorType.SERVER_ERROR, ExaErrorType.NETWORK, ExaErrorType.TIMEOUT].includes(error.type);
					}
					return error?.status === 429 || (error?.status >= 500 && error?.status < 600);
				},
				onRetry: (attempt, error, delayMs) => {
					console.log(`[Exa] Retry ${attempt}/3 after ${delayMs}ms:`, error?.message || error);
				}
			}
		);
	}

	/**
	 * Fetch text content for specific URLs (separate from search)
	 * Cost: $1 per 1000 pages
	 */
	async getContents(urls: string[]): Promise<Array<{ url: string; text: string }>> {
		if (urls.length === 0) return [];

		return withRetry(
			async () => {
				const response = await fetch(`${this.baseUrl}/contents`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-api-key': this.apiKey
					},
					body: JSON.stringify({
						urls,
						text: true
					})
				});

				if (!response.ok) {
					const error = await response.json().catch(() => ({}));
					throw this.handleError({ status: response.status, message: error.message || response.statusText });
				}

				const data = await response.json();
				return data.results || [];
			},
			{
				maxRetries: 3,
				initialDelayMs: 1000,
				retryableErrors: (error) => {
					if (error instanceof ExaError) {
						return [ExaErrorType.RATE_LIMIT, ExaErrorType.SERVER_ERROR, ExaErrorType.NETWORK, ExaErrorType.TIMEOUT].includes(error.type);
					}
					return error?.status === 429 || (error?.status >= 500 && error?.status < 600);
				},
				onRetry: (attempt, error, delayMs) => {
					console.log(`[Exa Contents] Retry ${attempt}/3 after ${delayMs}ms:`, error?.message || error);
				}
			}
		);
	}

	private handleError(error: any): ExaError {
		// Authentication errors
		if (error.status === 401 || error.status === 403) {
			return new ExaError(
				ExaErrorType.AUTHENTICATION,
				error.status,
				'Invalid or expired API key'
			);
		}

		// Rate limiting
		if (error.status === 429) {
			return new ExaError(ExaErrorType.RATE_LIMIT, 429, 'Rate limit exceeded');
		}

		// Timeout
		if (error.code === 'ETIMEDOUT') {
			return new ExaError(ExaErrorType.TIMEOUT, undefined, 'Request timed out');
		}

		// Network errors
		if (!error.status) {
			return new ExaError(ExaErrorType.NETWORK, undefined, 'Network connection failed');
		}

		// Server errors
		if (error.status >= 500) {
			return new ExaError(
				ExaErrorType.SERVER_ERROR,
				error.status,
				'Exa service temporarily unavailable'
			);
		}

		// Default
		return new ExaError(ExaErrorType.INVALID_REQUEST, error.status, error.message || 'Search failed');
	}
}
