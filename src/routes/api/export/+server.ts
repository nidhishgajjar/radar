import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { AgenticSearchService } from '$lib/server/agentic-search';
import { exportStateManager, type ExportStats } from '$lib/server/export-state-manager';
import { generateCSV, generateFilename } from '$lib/utils/csv';
import type { SearchResult, SearchFilters } from '$lib/types/exa';

const agenticSearch = new AgenticSearchService();

// Valid tier values
const VALID_TIERS = [20, 50, 100, 250, 500] as const;
type Tier = (typeof VALID_TIERS)[number];

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { query, tier, searchQueries, filters } = await request.json();

		// Validate input
		if (!query || typeof query !== 'string') {
			return json({ error: 'Query is required' }, { status: 400 });
		}

		if (!VALID_TIERS.includes(tier)) {
			return json({ error: 'Invalid tier. Must be 20, 50, 100, 250, or 500' }, { status: 400 });
		}

		if (!searchQueries || !Array.isArray(searchQueries) || searchQueries.length === 0) {
			return json({ error: 'Search queries are required' }, { status: 400 });
		}

		// Create export job
		const jobId = crypto.randomUUID();
		exportStateManager.createJob(jobId, query, tier as Tier);

		// Start background processing (fire-and-forget)
		processExport(jobId, query, tier as Tier, searchQueries, filters).catch((error) => {
			console.error('Export processing failed:', error);
			exportStateManager.markError(jobId, error.message || 'Export failed');
		});

		// Return immediately with job ID
		return json({
			jobId,
			status: 'queued'
		});
	} catch (error: unknown) {
		console.error('Export start error:', error);
		return json({ error: 'Failed to start export' }, { status: 500 });
	}
};

/**
 * Background export processing - exhaustively searches and filters candidates
 */
async function processExport(
	jobId: string,
	query: string,
	tier: Tier,
	searchQueries: string[],
	filters?: SearchFilters
) {
	try {
		exportStateManager.updateStatus(jobId, 'fetching', 5);

		// Target more than needed to account for filtering losses
		const targetCount = tier;

		console.log(`[Export ${jobId}] Starting exhaustive bulk search for ${targetCount} candidates...`);

		const bulkResult = await agenticSearch.searchBulk(
			query,
			targetCount,
			searchQueries,
			filters,
			({ totalRaw, unique, round }) => {
				// Update progress during fetching (5-40%)
				const progress = 5 + Math.min(35, round * 5);
				exportStateManager.updateProgress(jobId, progress, unique);
				exportStateManager.updateStats(jobId, {
					totalRawSearched: totalRaw,
					totalAfterDedup: unique
				});
			}
		);

		const allResults = bulkResult.results;
		const searchStats = bulkResult.stats;

		console.log(`[Export ${jobId}] Bulk search complete: ${searchStats.totalRawSearched} raw → ${searchStats.totalAfterDedup} unique (${searchStats.stopReason})`);

		// Filter results if needed
		if (filters?.externalOnly || filters?.excludeCurrentEmployer) {
			exportStateManager.updateStatus(jobId, 'filtering', 45);

			console.log(`[Export ${jobId}] Filtering ${allResults.length} results with LLM...`);

			const filterResult = await agenticSearch.filterResults(allResults, query, filters);

			// Sort: recentlyLeft first, then by fitScore
			const sortedResults = filterResult.results.sort((a, b) => {
				// Recently left candidates get priority
				const aRecent = a.filterMetadata?.recentlyLeft ? 1 : 0;
				const bRecent = b.filterMetadata?.recentlyLeft ? 1 : 0;
				if (aRecent !== bRecent) return bRecent - aRecent;

				// Then by fit score
				const scoreA = a.filterMetadata?.fitScore || 0;
				const scoreB = b.filterMetadata?.fitScore || 0;
				return scoreB - scoreA;
			});

			const filteredResults = sortedResults.slice(0, tier);
			exportStateManager.updateProgress(jobId, 90, filteredResults.length);

			// Build final stats
			const finalStats: ExportStats = {
				totalRawSearched: searchStats.totalRawSearched,
				totalAfterDedup: searchStats.totalAfterDedup,
				totalPassedFilter: filterResult.results.length,
				searchExhausted: searchStats.searchExhausted,
				stopReason: searchStats.stopReason
			};

			// Generate CSV
			exportStateManager.updateStatus(jobId, 'generating_csv', 95);
			const csvContent = generateCSV(filteredResults);

			exportStateManager.markReady(jobId, csvContent, filteredResults.length, finalStats);

			console.log(`[Export ${jobId}] Ready: ${filteredResults.length}/${tier} requested | Searched ${finalStats.totalRawSearched} raw → ${finalStats.totalAfterDedup} unique → ${finalStats.totalPassedFilter} passed filter | ${finalStats.searchExhausted ? 'EXHAUSTED' : 'More available'}`);
		} else {
			// No filtering needed
			const finalResults = allResults.slice(0, tier);

			const finalStats: ExportStats = {
				totalRawSearched: searchStats.totalRawSearched,
				totalAfterDedup: searchStats.totalAfterDedup,
				totalPassedFilter: allResults.length,
				searchExhausted: searchStats.searchExhausted,
				stopReason: searchStats.stopReason
			};

			exportStateManager.updateStatus(jobId, 'generating_csv', 95);
			const csvContent = generateCSV(finalResults);

			exportStateManager.markReady(jobId, csvContent, finalResults.length, finalStats);

			console.log(`[Export ${jobId}] Ready: ${finalResults.length}/${tier} | No filtering | ${finalStats.searchExhausted ? 'EXHAUSTED' : 'More available'}`);
		}
	} catch (error) {
		console.error(`[Export ${jobId}] Processing error:`, error);
		throw error;
	}
}
