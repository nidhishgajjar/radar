import { OpenRouterClient } from './openrouter-client';
import { ExaWrapper } from './exa-wrapper';
import { OpenRouterError, OpenRouterErrorType } from '$lib/types/openrouter';
import { QUERY_REFINEMENT_ENABLED } from '$env/static/private';
import type { SearchResult, SearchFilters } from '$lib/types/exa';
import { filterStateManager } from './filter-state-manager';

interface RefinedQuery {
	original: string;
	refined: string;
	llm_used: boolean;
	cached: boolean;
}

export class AgenticSearchService {
	private openRouter: OpenRouterClient;
	private exa: ExaWrapper;
	private queryCache: Map<string, { query: string; timestamp: number }>;
	private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour
	private readonly enableRefinement: boolean;

	constructor() {
		this.openRouter = new OpenRouterClient();
		this.exa = new ExaWrapper();
		this.queryCache = new Map();
		this.enableRefinement = QUERY_REFINEMENT_ENABLED === 'true';
	}

	private isURL(text: string): boolean {
		try {
			new URL(text.trim());
			return true;
		} catch {
			return false;
		}
	}

	private isJobDescription(text: string): boolean {
		// If text is longer than 200 characters and contains job-related keywords
		if (text.length < 200) return false;

		const jobKeywords = [
			'experience', 'required', 'responsibilities', 'qualifications',
			'skills', 'years', 'bachelor', 'degree', 'looking for',
			'seeking', 'hiring', 'position', 'role', 'candidate'
		];

		const lowerText = text.toLowerCase();
		const keywordMatches = jobKeywords.filter(keyword => lowerText.includes(keyword)).length;

		return keywordMatches >= 3;
	}

	/**
	 * Process a job URL: fetch content and extract search query
	 */
	async processJobURL(url: string): Promise<string> {
		const content = await this.fetchJobContent(url);
		if (!content) {
			throw new Error('Failed to fetch job URL content');
		}
		return await this.openRouter.extractRequirementsFromJob(content);
	}

	async fetchJobContent(url: string): Promise<string | null> {
		try {
			// Fetch the job posting content
			const response = await fetch(url, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; RadarBot/1.0; +https://radar.jobs.ca)'
				}
			});

			if (!response.ok) {
				console.error('Failed to fetch job URL:', response.status);
				return null;
			}

			const html = await response.text();

			// Basic HTML cleanup - extract text content
			const textContent = html
				.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
				.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
				.replace(/<[^>]+>/g, ' ')
				.replace(/\s+/g, ' ')
				.trim();

			// Return first 4000 chars (enough for LLM to understand the job)
			return textContent.substring(0, 4000);
		} catch (error) {
			console.error('Error fetching job URL:', error);
			return null;
		}
	}

	async refineQuery(userQuery: string): Promise<RefinedQuery> {
		// Check if refinement is disabled
		if (!this.enableRefinement) {
			return {
				original: userQuery,
				refined: userQuery,
				llm_used: false,
				cached: false
			};
		}

		// Detect input type
		const isUrl = this.isURL(userQuery);
		const isJobDesc = !isUrl && this.isJobDescription(userQuery);

		// Handle job URL
		if (isUrl) {
			console.log('Detected job URL, extracting requirements...');
			try {
				const extractedQuery = await this.processJobURL(userQuery);
				return {
					original: userQuery,
					refined: extractedQuery,
					llm_used: true,
					cached: false
				};
			} catch (error) {
				console.error('Failed to process job URL:', error);
				// Fallback to normal processing
			}
		}

		// Handle job description
		if (isJobDesc) {
			console.log('Detected job description, extracting requirements...');
			try {
				const extractedQuery = await this.openRouter.extractRequirementsFromJob(userQuery);

				if (this.isValidQuery(extractedQuery)) {
					return {
						original: userQuery,
						refined: extractedQuery,
						llm_used: true,
						cached: false
					};
				}
			} catch (error) {
				console.error('Failed to extract requirements from job description:', error);
				// Fallback to normal processing
			}
		}

		// Check cache for normal queries
		const cacheKey = this.getCacheKey(userQuery);
		const cached = this.queryCache.get(cacheKey);

		if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
			return {
				original: userQuery,
				refined: cached.query,
				llm_used: true,
				cached: true
			};
		}

		// Attempt LLM refinement with fallback
		let refined = userQuery;
		let llmUsed = false;

		try {
			refined = await this.openRouter.refineQuery(userQuery);

			// Validate refined query
			if (!this.isValidQuery(refined)) {
				console.warn('Invalid refined query, using original');
				refined = userQuery;
			} else {
				llmUsed = true;
				// Cache the result
				this.queryCache.set(cacheKey, {
					query: refined,
					timestamp: Date.now()
				});
			}
		} catch (error) {
			console.error('Query refinement failed, using original query:', error);

			// Log specific error types
			if (error instanceof OpenRouterError) {
				console.error(`OpenRouter error type: ${error.type}`);
			}

			refined = userQuery;
		}

		return {
			original: userQuery,
			refined,
			llm_used: llmUsed,
			cached: false
		};
	}

	/**
	 * Search for people and return raw deduplicated results immediately.
	 * Does NOT apply LLM filtering - returns results in 2-3 seconds.
	 * Use this for instant feedback while filtering runs in background.
	 */
	async searchRaw(
		userQuery: string,
		page: number = 1,
		providedQueries?: string[],
		filters?: SearchFilters
	) {
		const searchQueries: string[] = providedQueries || [];
		let queriesGenerated = false;
		const searchId = crypto.randomUUID();

		// Step 1: Generate multiple queries if not provided (first search)
		if (searchQueries.length === 0) {
			const queryGenStart = Date.now();
			console.log('Generating recruitment queries...');

			let jobContent = userQuery;

			// Check if input is a URL - fetch the job content
			if (this.isURL(userQuery)) {
				console.log('Detected job URL, fetching content...');
				const content = await this.fetchJobContent(userQuery);
				if (content) {
					jobContent = content;
					console.log('Fetched job content:', content.substring(0, 200) + '...');
				}
			}

			// Generate queries directly from content (one LLM call)
			const generated = await this.openRouter.generateRecruitmentQueries(
				jobContent,
				filters?.excludeCurrentEmployer,
				filters?.geographicFocus,
				filters?.flexibleLocation ?? false
			);

			searchQueries.push(...generated);
			queriesGenerated = true;

			console.log(`Generated ${searchQueries.length} queries in ${Date.now() - queryGenStart}ms:`, searchQueries);
		}

		// Step 2: Run all queries in parallel (100 results each, Exa max)
		const searchStart = Date.now();
		console.log(`Searching with ${searchQueries.length} queries (100 results each)...`);

		const searchPromises = searchQueries.map((query, i) =>
			this.exa.searchPeople(query, { numResults: 100 }).then(r => {
				console.log(`Query ${i + 1} completed in ${Date.now() - searchStart}ms with ${r.results.length} results`);
				return r;
			})
		);

		const allResults = await Promise.all(searchPromises);
		console.log(`All ${searchQueries.length} Exa searches completed in ${Date.now() - searchStart}ms`);

		// Step 3: Flatten and deduplicate by URL
		const seenUrls = new Set<string>();
		const uniqueResults: SearchResult[] = [];

		for (const searchResponse of allResults) {
			for (const result of searchResponse.results) {
				if (!seenUrls.has(result.url)) {
					seenUrls.add(result.url);
					uniqueResults.push(result);
				}
			}
		}

		console.log(`Found ${uniqueResults.length} unique profiles (raw, no filtering)`);

		// Return immediately with raw results - NO filtering applied
		return {
			results: uniqueResults,
			queries: searchQueries,
			searchId,
			metadata: {
				original_query: userQuery,
				page,
				total_results: uniqueResults.length,
				queries_used: searchQueries,
				queries_generated: queriesGenerated,
				filtering_applied: false
			}
		};
	}

	/**
	 * Apply LLM filtering to results.
	 * Called separately after searchRaw() for background processing.
	 */
	async filterResults(
		results: SearchResult[],
		userQuery: string,
		filters?: SearchFilters,
		searchId?: string
	) {
		if (!filters?.externalOnly && !filters?.excludeCurrentEmployer) {
			// No filtering needed
			return {
				results,
				metadata: {
					total_results_before_filter: results.length,
					total_results_after_filter: results.length,
					filtering_applied: false
				}
			};
		}

		console.log(`Applying LLM filtering to ${results.length} results in parallel...`);

		// Track progress
		let processed = 0;
		const filteredResults: SearchResult[] = [];

		// Process ALL results in parallel
		const filterPromises = results.map(async (result) => {
			try {
				const profileSummary = `
Title: ${result.title}
URL: ${result.url}
${result.text ? `Profile:\n${result.text.substring(0, 2000)}` : ''}
				`.trim();

				const filterResult = await this.openRouter.filterAndRankCandidate(
					profileSummary,
					userQuery,
					filters?.excludeCurrentEmployer,
					filters?.minYearsExperience
				);

				result.filterMetadata = filterResult;

				// Update progress immediately as each completes
				processed++;
				filteredResults.push(result);

				if (searchId) {
					const currentFiltered = filteredResults.filter((r) => {
						if (!r.filterMetadata) return false;
						if (filters?.externalOnly && !r.filterMetadata.isExternal) return false;
						if (r.filterMetadata.fitScore < 40) return false;
						return true;
					}).sort((a, b) => (b.filterMetadata?.fitScore || 0) - (a.filterMetadata?.fitScore || 0));

					filterStateManager.updateProgress(searchId, processed, currentFiltered);
				}

				return result;
			} catch (error) {
				console.error('Failed to filter candidate:', error);
				result.filterMetadata = {
					isExternal: true,
					fitScore: 30,
					reasoning: 'Filtering error',
					currentEmployer: undefined
				};
				processed++;
				filteredResults.push(result);
				return result;
			}
		});

		// Wait for all to complete
		await Promise.all(filterPromises);

		// Filter out internal candidates and low scores
		const externalResults = filteredResults.filter(result => {
			if (!result.filterMetadata) return false;

			// Apply external-only filter
			if (filters?.externalOnly && !result.filterMetadata.isExternal) {
				// Exception: include if they recently left and includeRecentDepartures is true
				if (!(filters?.includeRecentDepartures && result.filterMetadata.recentlyLeft)) {
					return false;
				}
			}

			// Minimum fit score threshold
			if (result.filterMetadata.fitScore < 40) {
				return false;
			}

			return true;
		});

		// Sort: recentlyLeft first, then by fit score
		externalResults.sort((a, b) => {
			// Recently left candidates get priority
			const aRecent = a.filterMetadata?.recentlyLeft ? 1 : 0;
			const bRecent = b.filterMetadata?.recentlyLeft ? 1 : 0;
			if (aRecent !== bRecent) return bRecent - aRecent;

			// Then by fit score
			const scoreA = a.filterMetadata?.fitScore || 0;
			const scoreB = b.filterMetadata?.fitScore || 0;
			return scoreB - scoreA;
		});

		console.log(`Filtered to ${externalResults.length} candidates (recentlyLeft prioritized)`);

		return {
			results: externalResults,
			metadata: {
				total_results_before_filter: results.length,
				total_results_after_filter: externalResults.length,
				filtering_applied: true
			}
		};
	}

	/**
	 * Bulk search for export - exhaustively fetches results using cursor pagination.
	 * Keeps going until Exa is exhausted or we have enough filtered results.
	 * Returns detailed stats about the search process.
	 */
	async searchBulk(
		userQuery: string,
		targetCount: number,
		providedQueries: string[],
		filters?: SearchFilters,
		onProgress?: (stats: { totalRaw: number; unique: number; round: number }) => void
	): Promise<{
		results: SearchResult[];
		stats: {
			totalRawSearched: number;
			totalAfterDedup: number;
			rounds: number;
			searchExhausted: boolean;
			stopReason: 'target_reached' | 'search_exhausted' | 'diminishing_returns';
		};
	}> {
		const seenUrls = new Set<string>();
		const allResults: SearchResult[] = [];
		const searchQueries = providedQueries;

		// Track cursors per query for pagination
		const cursors: (string | undefined)[] = searchQueries.map(() => undefined);
		let hasMore = true;
		let round = 0;
		let totalRawSearched = 0;
		let consecutiveLowYieldRounds = 0;
		let stopReason: 'target_reached' | 'search_exhausted' | 'diminishing_returns' = 'search_exhausted';

		// Keep fetching until exhausted - no arbitrary round limit
		while (hasMore) {
			round++;
			console.log(`[Bulk Search] Round ${round}: Fetching with ${searchQueries.length} queries...`);

			// Run all queries in parallel with their respective cursors
			const searchPromises = searchQueries.map((query, i) =>
				this.exa.searchPeople(query, { numResults: 100, cursor: cursors[i] }).then(r => {
					// Update cursor for next round
					cursors[i] = r.nextCursor;
					return { results: r.results, queryIndex: i, hasMore: !!r.nextCursor };
				}).catch(err => {
					console.error(`Query ${i + 1} failed:`, err);
					return { results: [], queryIndex: i, hasMore: false };
				})
			);

			const responses = await Promise.all(searchPromises);

			// Count raw results before dedup
			const rawThisRound = responses.reduce((sum, r) => sum + r.results.length, 0);
			totalRawSearched += rawThisRound;

			// Check if any query has more results
			hasMore = responses.some(r => r.hasMore);

			// Deduplicate and add results
			let newResults = 0;
			for (const response of responses) {
				for (const result of response.results) {
					if (!seenUrls.has(result.url)) {
						seenUrls.add(result.url);
						allResults.push(result);
						newResults++;
					}
				}
			}

			console.log(`[Bulk Search] Round ${round}: Raw ${rawThisRound}, New unique ${newResults}, Total unique ${allResults.length}, HasMore: ${hasMore}`);

			if (onProgress) {
				onProgress({ totalRaw: totalRawSearched, unique: allResults.length, round });
			}

			// Check if we have enough (with buffer for filtering losses)
			if (allResults.length >= targetCount * 1.5) {
				stopReason = 'target_reached';
				console.log(`[Bulk Search] Target reached with buffer (${allResults.length} >= ${targetCount * 1.5})`);
				break;
			}

			// Track diminishing returns - stop if 3 consecutive rounds with <5% new results
			if (rawThisRound > 0 && newResults / rawThisRound < 0.05) {
				consecutiveLowYieldRounds++;
				if (consecutiveLowYieldRounds >= 3) {
					stopReason = 'diminishing_returns';
					console.log(`[Bulk Search] Stopping - 3 consecutive low yield rounds`);
					break;
				}
			} else {
				consecutiveLowYieldRounds = 0;
			}

			// If no more results from any query
			if (!hasMore) {
				stopReason = 'search_exhausted';
				console.log(`[Bulk Search] Search exhausted - no more results from Exa`);
			}
		}

		console.log(`[Bulk Search] Complete: ${allResults.length} unique from ${totalRawSearched} raw after ${round} rounds. Reason: ${stopReason}`);

		return {
			results: allResults,
			stats: {
				totalRawSearched,
				totalAfterDedup: allResults.length,
				rounds: round,
				searchExhausted: !hasMore,
				stopReason
			}
		};
	}

	/**
	 * Original searchPeople method - kept for backward compatibility.
	 * Waits for full LLM filtering before returning.
	 */
	async searchPeople(
		userQuery: string,
		page: number = 1,
		providedQueries?: string[],
		filters?: SearchFilters
	) {
		const searchQueries: string[] = providedQueries || [];
		let queriesGenerated = false;

		// Step 1: Generate multiple queries if not provided (first search)
		if (searchQueries.length === 0) {
			console.log('Generating recruitment queries...');

			// First, refine the original query to understand intent
			const refinedQuery = await this.refineQuery(userQuery);

			// Then generate multiple search angles
			const generated = await this.openRouter.generateRecruitmentQueries(
				refinedQuery.refined,
				filters?.excludeCurrentEmployer,
				filters?.geographicFocus
			);

			searchQueries.push(...generated);
			queriesGenerated = true;

			console.log(`Generated ${searchQueries.length} search queries:`, searchQueries);
		}

		// Step 2: Run all queries in parallel (100 results each, Exa max)
		console.log(`Searching with ${searchQueries.length} queries (100 results each)...`);

		const searchPromises = searchQueries.map(query =>
			this.exa.searchPeople(query, { numResults: 100 })
		);

		const allResults = await Promise.all(searchPromises);

		// Step 3: Flatten and deduplicate by URL
		const seenUrls = new Set<string>();
		const uniqueResults: SearchResult[] = [];

		for (const searchResponse of allResults) {
			for (const result of searchResponse.results) {
				if (!seenUrls.has(result.url)) {
					seenUrls.add(result.url);
					uniqueResults.push(result);
				}
			}
		}

		console.log(`Found ${uniqueResults.length} unique profiles before filtering`);

		// Step 4: Apply LLM filtering to each result (in parallel batches)
		if (filters?.externalOnly || filters?.excludeCurrentEmployer) {
			console.log('Applying LLM filtering...');

			const filterPromises = uniqueResults.map(async (result) => {
				try {
					// Create profile summary for LLM
					const profileSummary = `
Title: ${result.title}
URL: ${result.url}
${result.text ? `Profile:\n${result.text.substring(0, 2000)}` : ''}
					`.trim();

					const filterResult = await this.openRouter.filterAndRankCandidate(
						profileSummary,
						userQuery,
						filters?.excludeCurrentEmployer,
						filters?.minYearsExperience
					);

					// Add filter metadata to result
					result.filterMetadata = filterResult;

					return result;
				} catch (error) {
					console.error('Failed to filter candidate:', error);
					// On error, mark as low score but keep in results
					result.filterMetadata = {
						isExternal: true,
						fitScore: 30,
						reasoning: 'Filtering error',
						currentEmployer: undefined
					};
					return result;
				}
			});

			// Wait for all filtering to complete
			const filteredResults = await Promise.all(filterPromises);

			// Step 5: Filter out internal candidates and low scores
			const externalResults = filteredResults.filter(result => {
				if (!result.filterMetadata) return false;

				// Apply external-only filter
				if (filters?.externalOnly && !result.filterMetadata.isExternal) {
					// Exception: include if they recently left and includeRecentDepartures is true
					if (!(filters?.includeRecentDepartures && result.filterMetadata.recentlyLeft)) {
						return false;
					}
				}

				// Minimum fit score threshold
				if (result.filterMetadata.fitScore < 40) {
					return false;
				}

				return true;
			});

			// Sort: recentlyLeft first, then by fit score
			externalResults.sort((a, b) => {
				// Recently left candidates get priority
				const aRecent = a.filterMetadata?.recentlyLeft ? 1 : 0;
				const bRecent = b.filterMetadata?.recentlyLeft ? 1 : 0;
				if (aRecent !== bRecent) return bRecent - aRecent;

				// Then by fit score
				const scoreA = a.filterMetadata?.fitScore || 0;
				const scoreB = b.filterMetadata?.fitScore || 0;
				return scoreB - scoreA;
			});

			console.log(`Filtered to ${externalResults.length} candidates (recentlyLeft prioritized)`);

			return {
				results: externalResults,
				queries: searchQueries, // Return queries for pagination
				metadata: {
					original_query: userQuery,
					page,
					total_results_before_filter: uniqueResults.length,
					total_results_after_filter: externalResults.length,
					queries_used: searchQueries,
					queries_generated: queriesGenerated
				}
			};
		}

		// No filtering, return all unique results
		return {
			results: uniqueResults,
			queries: searchQueries,
			metadata: {
				original_query: userQuery,
				page,
				total_results: uniqueResults.length,
				queries_used: searchQueries,
				queries_generated: queriesGenerated
			}
		};
	}

	private isValidQuery(query: string): boolean {
		// Basic validation
		if (!query || query.trim().length === 0) {
			return false;
		}

		// Check for reasonable length
		if (query.length > 200) {
			return false;
		}

		// Check for hallucination indicators
		const hallucinations = [
			'I cannot',
			'I apologize',
			'As an AI',
			'I do not have',
			'Sorry',
			'I\'m sorry'
		];

		const lowerQuery = query.toLowerCase();
		for (const phrase of hallucinations) {
			if (lowerQuery.includes(phrase.toLowerCase())) {
				return false;
			}
		}

		return true;
	}

	private getCacheKey(query: string): string {
		return query.toLowerCase().trim();
	}

	clearCache() {
		this.queryCache.clear();
	}
}
