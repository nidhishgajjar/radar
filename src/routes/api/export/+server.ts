import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { AgenticSearchService } from '$lib/server/agentic-search';
import { exportStateManager, type ExportStats } from '$lib/server/export-state-manager';
import { generateCSV } from '$lib/utils/csv';
import type { SearchResult, SearchFilters } from '$lib/types/exa';

const agenticSearch = new AgenticSearchService();

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { query, searchQueries, filters } = await request.json();

		// Validate input
		if (!query || typeof query !== 'string') {
			return json({ error: 'Query is required' }, { status: 400 });
		}

		// searchQueries is now optional - will be generated if not provided

		// Create export job (tier=0 means export all)
		const jobId = crypto.randomUUID();
		exportStateManager.createJob(jobId, query, 0);

		// Start background processing (fire-and-forget)
		processExport(jobId, query, searchQueries, filters).catch((error) => {
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
 * Background export processing - exhaustively searches ALL candidates
 * Returns all unique candidates with qualified ones at top, others below
 */
async function processExport(
	jobId: string,
	query: string,
	searchQueries?: string[],
	filters?: SearchFilters
) {
	try {
		let queriesToUse = searchQueries || [];

		// If no queries provided, generate them first (direct export mode)
		if (queriesToUse.length === 0) {
			exportStateManager.updateStatus(jobId, 'generating_queries', 2);
			console.log(`[Export ${jobId}] Generating search queries...`);

			// Use searchRaw to generate queries (it will create them if not provided)
			const initialSearch = await agenticSearch.searchRaw(query, 1, undefined, filters, 1);
			queriesToUse = initialSearch.queries;

			console.log(`[Export ${jobId}] Generated ${queriesToUse.length} queries`);
		}

		exportStateManager.updateStatus(jobId, 'fetching', 5);

		// Target a large number to get all available candidates
		const targetCount = 1000;

		console.log(`[Export ${jobId}] Starting exhaustive search for ALL candidates...`);

		const bulkResult = await agenticSearch.searchBulk(
			query,
			targetCount,
			queriesToUse,
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

		// Always apply LLM filtering to categorize candidates
		exportStateManager.updateStatus(jobId, 'filtering', 45);

		console.log(`[Export ${jobId}] Analyzing ${allResults.length} candidates with LLM...`);

		const filterResult = await agenticSearch.filterResults(allResults, query, filters);

		// Separate qualified (passed filter) and other candidates
		const qualifiedResults = filterResult.results;
		const qualifiedUrls = new Set(qualifiedResults.map(r => r.url));

		// Mark all results with their filter status
		const allWithStatus = allResults.map(result => ({
			...result,
			filterMetadata: {
				...result.filterMetadata,
				qualified: qualifiedUrls.has(result.url),
				fitScore: qualifiedUrls.has(result.url)
					? (qualifiedResults.find(r => r.url === result.url)?.filterMetadata?.fitScore || 0)
					: 0,
				recentlyLeft: qualifiedUrls.has(result.url)
					? (qualifiedResults.find(r => r.url === result.url)?.filterMetadata?.recentlyLeft || false)
					: false
			}
		}));

		// Sort: qualified first (by recentlyLeft, then fitScore), then others
		const sortedResults = allWithStatus.sort((a, b) => {
			// Qualified candidates first
			const aQualified = a.filterMetadata?.qualified ? 1 : 0;
			const bQualified = b.filterMetadata?.qualified ? 1 : 0;
			if (aQualified !== bQualified) return bQualified - aQualified;

			// Among qualified: recently left first
			const aRecent = a.filterMetadata?.recentlyLeft ? 1 : 0;
			const bRecent = b.filterMetadata?.recentlyLeft ? 1 : 0;
			if (aRecent !== bRecent) return bRecent - aRecent;

			// Then by fit score
			const scoreA = a.filterMetadata?.fitScore || 0;
			const scoreB = b.filterMetadata?.fitScore || 0;
			return scoreB - scoreA;
		});

		exportStateManager.updateProgress(jobId, 90, sortedResults.length);

		// Build final stats
		const finalStats: ExportStats = {
			totalRawSearched: searchStats.totalRawSearched,
			totalAfterDedup: searchStats.totalAfterDedup,
			totalPassedFilter: qualifiedResults.length,
			searchExhausted: searchStats.searchExhausted,
			stopReason: searchStats.stopReason
		};

		// Generate CSV with all candidates
		exportStateManager.updateStatus(jobId, 'generating_csv', 95);
		const csvContent = generateCSV(sortedResults);

		exportStateManager.markReady(jobId, csvContent, sortedResults.length, finalStats);

		console.log(`[Export ${jobId}] Ready: ${sortedResults.length} total (${qualifiedResults.length} qualified) | Searched ${finalStats.totalRawSearched} raw → ${finalStats.totalAfterDedup} unique | ${finalStats.searchExhausted ? 'EXHAUSTED' : 'More available'}`);
	} catch (error) {
		console.error(`[Export ${jobId}] Processing error:`, error);
		throw error;
	}
}
