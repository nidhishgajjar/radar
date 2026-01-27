import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { AgenticSearchService } from '$lib/server/agentic-search';
import { ExaErrorType, type SearchFilters } from '$lib/types/exa';
import { filterStateManager } from '$lib/server/filter-state-manager';

const agenticSearch = new AgenticSearchService();

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { query, page = 1, queries, filters, mode = 'search' } = await request.json();

		// Validate input
		if (!query || typeof query !== 'string') {
			return json({ error: 'Query is required' }, { status: 400 });
		}

		if (query.length < 3) {
			return json({ error: 'Query must be at least 3 characters' }, { status: 400 });
		}

		const searchFilters: SearchFilters | undefined = filters;

		// Determine results per query based on mode
		// Search mode: 25 per query (100 total) - quick preview
		// Export mode: 100 per query (400 total) - exhaustive
		const numResultsPerQuery = mode === 'export' ? 100 : 25;

		// Use searchRaw() for immediate results (2-3 seconds)
		// Returns deduplicated results WITHOUT LLM filtering
		const searchResult = await agenticSearch.searchRaw(
			query,
			page,
			queries,
			searchFilters,
			numResultsPerQuery
		);

		// Start background filtering if filters are enabled
		if (searchFilters?.externalOnly || searchFilters?.excludeCurrentEmployer) {
			// Initialize filter state
			filterStateManager.createFilteringTask(
				searchResult.searchId,
				searchResult.results.length
			);

			// Run filtering in background (don't await)
			agenticSearch
				.filterResults(searchResult.results, query, searchFilters, searchResult.searchId)
				.then((filterResult) => {
					// Update state with final filtered results
					filterStateManager.markCompleted(
						searchResult.searchId,
						filterResult.results
					);
				})
				.catch((error) => {
					console.error('Background filtering failed:', error);
					filterStateManager.markError(
						searchResult.searchId,
						error.message || 'Filtering error'
					);
				});
		}

		// Return raw results immediately with filtering_pending status
		return json({
			results: searchResult.results,
			metadata: searchResult.metadata,
			queries: searchResult.queries,
			searchId: searchResult.searchId,
			status:
				searchFilters?.externalOnly || searchFilters?.excludeCurrentEmployer
					? 'filtering_pending'
					: 'complete'
		});
	} catch (error: any) {
		console.error('Search error:', error);

		// Handle Exa-specific errors
		if (error.type) {
			switch (error.type) {
				case ExaErrorType.RATE_LIMIT:
					return json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
				case ExaErrorType.AUTHENTICATION:
					return json({ error: 'Authentication failed' }, { status: 500 });
				case ExaErrorType.TIMEOUT:
					return json({ error: 'Request timed out' }, { status: 504 });
				case ExaErrorType.NETWORK:
					return json({ error: 'Network error' }, { status: 503 });
				default:
					return json({ error: error.message || 'Search failed' }, { status: 500 });
			}
		}

		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
