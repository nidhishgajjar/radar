import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { AgenticSearchService } from '$lib/server/agentic-search';
import { exportStateManager, type ExportStats } from '$lib/server/export-state-manager';
import { companyEnrichment } from '$lib/server/company-enrichment';
import { generateCSV } from '$lib/utils/csv';
import { ClaudeClient } from '$lib/server/claude-client';
import type { SearchResult, SearchFilters } from '$lib/types/exa';

const agenticSearch = new AgenticSearchService();

/**
 * Check if a string is a URL
 */
function isURL(text: string): boolean {
	try {
		new URL(text.trim());
		return true;
	} catch {
		return false;
	}
}

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
		ClaudeClient.resetSessionCost();

		let queriesToUse = searchQueries || [];

		// Check if query is a job URL - extract employer for filtering
		let effectiveFilters = filters;
		const isJobUrl = isURL(query);
		if (isJobUrl) {
			const extractedEmployer = agenticSearch.extractEmployerFromURL(query);
			if (extractedEmployer && !filters?.excludeCurrentEmployer) {
				console.log(`[Export ${jobId}] Extracted employer from URL: "${extractedEmployer}"`);
				effectiveFilters = {
					...filters,
					externalOnly: true,
					includeRecentDepartures: filters?.includeRecentDepartures ?? true,
					excludeCurrentEmployer: extractedEmployer
				};
			}
		}

		// If no queries provided, generate them first (direct export mode)
		if (queriesToUse.length === 0) {
			exportStateManager.updateStatus(jobId, 'generating_queries', 2);
			console.log(`[Export ${jobId}] Generating search queries...`);

			// Use searchRaw to generate queries (it will create them if not provided)
			const initialSearch = await agenticSearch.searchRaw(query, 1, undefined, effectiveFilters, 1);
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
			effectiveFilters,
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

		// ========== NEW FLOW: Enrich BEFORE Filter ==========
		// Step 1: Company enrichment for ALL candidates (so LLM can use company data for filtering)
		exportStateManager.updateStatus(jobId, 'enriching', 45);

		// Extract unique company names from ALL results
		const companyNames = allResults
			.map(r => extractCompanyFromTitle(r.title))
			.filter((c): c is string => !!c && c.length > 2);

		const uniqueCompanies = [...new Set(companyNames)];
		let exaEnrichmentCost = 0;
		const companyDataMap = new Map<string, SearchResult['companyData']>();

		console.log(`[Export ${jobId}] Enriching ${uniqueCompanies.length} unique companies BEFORE filtering...`);

		if (uniqueCompanies.length > 0) {
			const enrichmentResult = await companyEnrichment.enrichCompanies(uniqueCompanies, { includeNews: false });
			exaEnrichmentCost = enrichmentResult.stats.estimatedCost;
			console.log(`[Export ${jobId}] Enriched ${enrichmentResult.stats.companiesFound}/${enrichmentResult.stats.companiesSearched} companies ($${exaEnrichmentCost.toFixed(3)})`);

			// Build company data map and attach to results
			for (const result of allResults) {
				const company = extractCompanyFromTitle(result.title);
				if (company) {
					const normalizedKey = company.toLowerCase().replace(/[^a-z0-9]/g, '');
					const companyData = enrichmentResult.results.get(normalizedKey);
					if (companyData) {
						result.companyData = companyData;
						companyDataMap.set(normalizedKey, companyData);
					}
				}
			}
		}

		exportStateManager.updateProgress(jobId, 60, allResults.length);

		// Step 2: LLM filtering WITH company data available
		exportStateManager.updateStatus(jobId, 'filtering', 65);

		console.log(`[Export ${jobId}] Analyzing ${allResults.length} candidates with LLM (company data available)...`);

		// Use forceFilter=true to always run LLM filtering for export
		// Results now have companyData attached, which the filter can use
		const filterResult = await agenticSearch.filterResults(allResults, query, effectiveFilters, undefined, true);

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

		// Get qualified results for counting
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

		exportStateManager.updateProgress(jobId, 92, sortedResults.length);

		// Get LLM costs
		const llmCost = ClaudeClient.getSessionCost();

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
