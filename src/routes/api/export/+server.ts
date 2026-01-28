import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { AgenticSearchService } from '$lib/server/agentic-search';
import { exportStateManager, type ExportStats } from '$lib/server/export-state-manager';
import { companyEnrichment } from '$lib/server/company-enrichment';
import { generateCSV } from '$lib/utils/csv';
import { OpenRouterClient } from '$lib/server/openrouter-client';
import type { SearchResult, SearchFilters } from '$lib/types/exa';

const agenticSearch = new AgenticSearchService();

/**
 * Extract company name from LinkedIn title
 */
function extractCompanyFromTitle(title: string): string | null {
	// Try to extract company from "Name at Company" or "Name | Role at Company"
	const atMatch = title.match(/(?:at|@)\s+([^|]+?)(?:\s*[|]|$)/i);
	if (atMatch) return atMatch[1].trim();

	// Try "Role, Company" pattern
	const parts = title.split(',');
	if (parts.length >= 2) {
		const lastPart = parts[parts.length - 1].trim();
		if (lastPart.length > 2 && lastPart.length < 50) return lastPart;
	}

	return null;
}

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
		// Reset LLM cost tracking for this export
		OpenRouterClient.resetSessionCost();

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

		// Use forceFilter=true to always run LLM filtering for export (get fit scores and key highlights)
		// This returns ALL results with their filterMetadata, not just qualified ones
		const filterResult = await agenticSearch.filterResults(allResults, query, filters, undefined, true);

		// All results now have filterMetadata. Mark qualified based on fit score threshold
		const allWithStatus = filterResult.results.map(result => {
			const fitScore = result.filterMetadata?.fitScore || 0;
			const isQualified = fitScore >= 40;

			return {
				...result,
				filterMetadata: {
					...result.filterMetadata,
					qualified: isQualified
				}
			};
		});

		// Get qualified results for counting and company enrichment
		const qualifiedResults = allWithStatus.filter(r => r.filterMetadata?.qualified);

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

		exportStateManager.updateProgress(jobId, 85, sortedResults.length);

		// Run company enrichment for qualified candidates
		console.log(`[Export ${jobId}] Enriching companies for ${qualifiedResults.length} qualified candidates...`);
		exportStateManager.updateStatus(jobId, 'enriching', 87);

		// Extract unique company names from qualified results
		const companyNames = qualifiedResults
			.map(r => r.filterMetadata?.currentEmployer || extractCompanyFromTitle(r.title))
			.filter((c): c is string => !!c && c.length > 2);

		const uniqueCompanies = [...new Set(companyNames)];
		let exaEnrichmentCost = 0;

		if (uniqueCompanies.length > 0) {
			const enrichmentResult = await companyEnrichment.enrichCompanies(uniqueCompanies, { includeNews: false });
			exaEnrichmentCost = enrichmentResult.stats.estimatedCost;
			console.log(`[Export ${jobId}] Enriched ${enrichmentResult.stats.companiesFound}/${enrichmentResult.stats.companiesSearched} companies ($${exaEnrichmentCost.toFixed(3)})`);

			// Add company data to results
			for (const result of sortedResults) {
				const company = result.filterMetadata?.currentEmployer || extractCompanyFromTitle(result.title);
				if (company) {
					const normalizedKey = company.toLowerCase().replace(/[^a-z0-9]/g, '');
					const companyData = enrichmentResult.results.get(normalizedKey);
					if (companyData) {
						result.companyData = companyData;
					}
				}
			}
		}

		exportStateManager.updateProgress(jobId, 92, sortedResults.length);

		// Get LLM costs
		const llmCost = OpenRouterClient.getSessionCost();

		// Build final stats with costs
		const finalStats: ExportStats = {
			totalRawSearched: searchStats.totalRawSearched,
			totalAfterDedup: searchStats.totalAfterDedup,
			totalPassedFilter: qualifiedResults.length,
			queriesUsed: searchStats.queriesUsed,
			searchExhausted: searchStats.searchExhausted,
			stopReason: searchStats.stopReason,
			llmCost: llmCost.cost,
			exaEnrichmentCost
		};

		// Generate CSV with all candidates
		exportStateManager.updateStatus(jobId, 'generating_csv', 95);
		const csvContent = generateCSV(sortedResults);

		exportStateManager.markReady(jobId, csvContent, sortedResults.length, finalStats);

		// Log final summary with costs
		const totalCost = llmCost.cost + exaEnrichmentCost;
		console.log(`[Export ${jobId}] Ready: ${sortedResults.length} total (${qualifiedResults.length} qualified) | ${finalStats.queriesUsed} queries | ${finalStats.totalRawSearched} raw → ${finalStats.totalAfterDedup} unique | ${finalStats.stopReason}`);
		console.log(`[Export ${jobId}] Costs: LLM $${llmCost.cost.toFixed(4)} (${llmCost.requests} calls) + Exa $${exaEnrichmentCost.toFixed(3)} = Total $${totalCost.toFixed(3)}`);
	} catch (error) {
		console.error(`[Export ${jobId}] Processing error:`, error);
		throw error;
	}
}
