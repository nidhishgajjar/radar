import Exa from 'exa-js';
import { EXA_API_KEY } from '$env/static/private';
import { ExaError, ExaErrorType, type SearchResponse } from '$lib/types/exa';

export class ExaWrapper {
	private client: Exa;

	constructor() {
		if (!EXA_API_KEY) {
			throw new Error('EXA_API_KEY environment variable is required');
		}
		this.client = new Exa(EXA_API_KEY);
	}

	async searchPeople(
		query: string,
		options?: { page?: number; numResults?: number }
	): Promise<SearchResponse> {
		try {
			const numResults = options?.numResults || 20;
			const page = options?.page || 1;

			const results = await this.client.searchAndContents(query, {
				category: 'people',
				numResults,
				text: true,
				type: 'auto',
				...(page > 1 && { startCrawlDate: undefined, page })
			});

			return results as SearchResponse;
		} catch (error: any) {
			throw this.handleError(error);
		}
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
