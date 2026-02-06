import { ClaudeClient } from './claude-client';
import { ExaWrapper } from './exa-wrapper';
import { ClaudeError, ClaudeErrorType } from '$lib/types/claude';
import { QUERY_REFINEMENT_ENABLED } from '$env/static/private';
import type { SearchResult, SearchFilters } from '$lib/types/exa';
import { filterStateManager } from './filter-state-manager';
import { exportStateManager } from './export-state-manager';
import { extractCurrentCompanyData } from '$lib/utils/company-urls';
import { countTokens } from '@anthropic-ai/tokenizer';

interface RefinedQuery {
	original: string;
	refined: string;
	llm_used: boolean;
	cached: boolean;
}

export class AgenticSearchService {
	private claude: ClaudeClient;
	private exa: ExaWrapper;
	private queryCache: Map<string, { query: string; timestamp: number }>;
	private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour
	private readonly enableRefinement: boolean;

	constructor() {
		this.claude = new ClaudeClient();
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
	 * Extract employer name from a job URL hostname
	 */
	extractEmployerFromURL(url: string): string | null {
		try {
			const urlObj = new URL(url);
			const hostname = urlObj.hostname.toLowerCase();

			// Common patterns for career sites
			// careers.companyname.com or companyname.com/careers or jobs.companyname.com
			const patterns = [
				/^careers\.(.+?)\.(com|ca|org|net|io)$/,
				/^jobs\.(.+?)\.(com|ca|org|net|io)$/,
				/^(.+?)\.recruitee\.com$/,
				/^(.+?)\.greenhouse\.io$/,
				/^(.+?)\.lever\.co$/,
				/^(.+?)\.workday\.com$/,
				/^(.+?)\.myworkdayjobs\.com$/,
			];

			for (const pattern of patterns) {
				const match = hostname.match(pattern);
				if (match) {
					// Clean up the company name
					return match[1].replace(/-/g, ' ').replace(/healthservices/gi, 'Health Services').trim();
				}
			}

			// Fallback: extract main domain part
			const parts = hostname.replace(/^(www\.|careers\.|jobs\.)/, '').split('.');
			if (parts.length >= 2) {
				// Return the main domain name, cleaned up
				const companyPart = parts[0];
				// Convert camelCase or hyphenated to spaces
				return companyPart
					.replace(/([a-z])([A-Z])/g, '$1 $2')
					.replace(/-/g, ' ')
					.replace(/healthservices/gi, 'Health Services')
					.trim();
			}

			return null;
		} catch {
			return null;
		}
	}

	/**
	 * Process a job URL: fetch content and extract search query
	 */
	async processJobURL(url: string): Promise<string> {
		const content = await this.fetchJobContent(url);
		if (!content) {
			throw new Error('Failed to fetch job URL content');
		}
		return await this.claude.extractRequirementsFromJob(content);
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
				const extractedQuery = await this.claude.extractRequirementsFromJob(userQuery);

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
			refined = await this.claude.refineQuery(userQuery);

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
			if (error instanceof ClaudeError) {
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
	 *
	 * @param numResultsPerQuery - Results per query (default: 25 for quick preview, 100 for exhaustive)
	 * @param numQueries - Number of search queries to generate (default: 4 for preview, 10 for export)
	 */
	async searchRaw(
		userQuery: string,
		page: number = 1,
		providedQueries?: string[],
		filters?: SearchFilters,
		numResultsPerQuery: number = 25,
		numQueries: number = 4
	) {
		const searchQueries: string[] = providedQueries || [];
		let queriesGenerated = false;
		const searchId = crypto.randomUUID();

		// Step 1: Generate multiple queries if not provided (first search)
		if (searchQueries.length === 0) {
			const queryGenStart = Date.now();
			console.log('Generating recruitment queries...');

			let jobContent = userQuery;
			let employerFromUrl: string | null = null;

			// Check if input is a URL - fetch the job content AND extract employer
			if (this.isURL(userQuery)) {
				console.log('Detected job URL, fetching content...');

				// Extract employer from URL hostname
				employerFromUrl = this.extractEmployerFromURL(userQuery);
				if (employerFromUrl) {
					console.log(`Extracted employer from URL: "${employerFromUrl}"`);
				}

				const content = await this.fetchJobContent(userQuery);
				if (content) {
					jobContent = content;
					console.log('Fetched job content:', content.substring(0, 200) + '...');

					// Prepend employer context to job content so LLM knows this is the hiring company
					if (employerFromUrl) {
						jobContent = `HIRING COMPANY: ${employerFromUrl}\n\n${content}`;
					}
				}
			}

			// Use employer from URL if not explicitly set in filters
			const excludeEmployer = filters?.excludeCurrentEmployer || employerFromUrl || undefined;

			// Generate queries directly from content (one LLM call)
			const generated = await this.claude.generateRecruitmentQueries(
				jobContent,
				excludeEmployer,
				filters?.geographicFocus,
				filters?.flexibleLocation ?? false
			);

			searchQueries.push(...generated);
			queriesGenerated = true;

			console.log(`Generated ${searchQueries.length} queries in ${Date.now() - queryGenStart}ms:`, searchQueries);
		}

		// Step 2: Run all queries in parallel WITHOUT text (cheaper: $0.025 vs $0.125 per query)
		const searchStart = Date.now();
		console.log(`Searching with ${searchQueries.length} queries (${numResultsPerQuery} results each, no text)...`);

		const searchPromises = searchQueries.map((query, i) =>
			this.exa.searchPeople(query, { numResults: numResultsPerQuery, includeText: false }).then(r => {
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

		console.log(`Found ${uniqueResults.length} unique profiles (deduped, fetching text...)`);

		// Step 4: Fetch text content ONLY for unique URLs (saves ~24% on text costs)
		const uniqueUrls = uniqueResults.map(r => r.url);
		if (uniqueUrls.length > 0) {
			try {
				const contentsStart = Date.now();
				const contents = await this.exa.getContents(uniqueUrls);
				const textMap = new Map(contents.map(c => [c.url, c.text]));

				// Merge text into results
				for (const result of uniqueResults) {
					result.text = textMap.get(result.url) || '';
				}
				console.log(`Fetched text for ${contents.length} unique profiles in ${Date.now() - contentsStart}ms`);
			} catch (error) {
				console.error('Failed to fetch contents, proceeding without text:', error);
			}
		}

		console.log(`Found ${uniqueResults.length} unique profiles with text`);

		// Step 5: Extract company data from inline text (free — no extra API calls)
		let companyCount = 0;
		for (const result of uniqueResults) {
			const companyData = extractCurrentCompanyData(result);
			if (companyData) {
				result.companyData = companyData;
				companyCount++;
			}
		}
		console.log(`Extracted company data for ${companyCount}/${uniqueResults.length} profiles from text`);

		// Use employer from URL if not explicitly set in filters
		const extractedEmployer = this.isURL(userQuery) ? this.extractEmployerFromURL(userQuery) : null;

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
				filtering_applied: false,
				extracted_employer: extractedEmployer
			}
		};
	}

	/**
	 * Apply LLM filtering to results.
	 * Called separately after searchRaw() for background processing.
	 *
	 * @param forceFilter - If true, always run LLM filtering even without externalOnly/excludeCurrentEmployer filters.
	 *                      Use this for export mode to get fit scores and key highlights.
	 */
	async filterResults(
		results: SearchResult[],
		userQuery: string,
		filters?: SearchFilters,
		searchId?: string,
		forceFilter: boolean = false
	) {
		// Skip filtering only if no filters AND not forced
		if (!forceFilter && !filters?.externalOnly && !filters?.excludeCurrentEmployer) {
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

		const MAX_TOKENS_PER_BATCH = 120000; // Stay under 150K context window
		const MAX_CONCURRENT_BATCHES = 3;

		// Build all candidate texts first to measure actual token count
		const allCandidates = results.map((result, i) => {
			let companyCtx: string | undefined;
			if (result.companyData) {
				const cd = result.companyData;
				const parts = [cd.name];
				if (cd.industry) parts.push(cd.industry);
				if (cd.headcount) parts.push(`${cd.headcount} employees`);
				if (cd.headquarters) parts.push(cd.headquarters);
				companyCtx = parts.join(' | ');
			}
			const profile = `Title: ${result.title}\nURL: ${result.url}\n${result.text ? `Profile:\n${result.text.substring(0, 800)}` : ''}`.trim();
			return { id: i, profile, companyContext: companyCtx };
		});

		// Count actual tokens using Anthropic tokenizer
		const allText = allCandidates.map(c => c.profile + (c.companyContext || '')).join('\n\n');
		const totalTokens = countTokens(allText) + countTokens(userQuery.substring(0, 400)) + 200; // +200 for prompt template

		// Calculate how many batches we actually need
		const numBatches = Math.max(1, Math.ceil(totalTokens / MAX_TOKENS_PER_BATCH));
		const batchSize = Math.ceil(results.length / numBatches);

		console.log(`LLM filtering: ${results.length} results, ${totalTokens} tokens → ${numBatches} batch(es) of ~${batchSize} (max ${MAX_CONCURRENT_BATCHES} concurrent)`);

		// Track progress
		let processed = 0;
		const filteredResults: SearchResult[] = [];

		// Build dynamic batches
		const batches: SearchResult[][] = [];
		for (let i = 0; i < results.length; i += batchSize) {
			batches.push(results.slice(i, i + batchSize));
		}

		// Process batches with concurrency limit
		const processBatch = async (batch: SearchResult[], batchIdx: number, startIdx: number) => {
			// Slice the pre-built candidates for this batch, re-index from 0
			const candidates = allCandidates.slice(startIdx, startIdx + batch.length).map((c, i) => ({
				...c,
				id: i
			}));

			try {
				const batchResults = await this.claude.filterCandidateBatch(
					candidates,
					userQuery,
					filters?.excludeCurrentEmployer
				);

				// Map results back to SearchResult objects
				for (const br of batchResults) {
					const result = batch[br.id];
					if (result) {
						result.filterMetadata = {
							currentEmployer: br.currentEmployer,
							isExternal: br.isExternal,
							fitScore: br.fitScore,
							reasoning: br.reasoning,
							recentlyLeft: br.recentlyLeft,
							matchingFactors: br.matchingFactors || [],
							keyHighlights: br.keyHighlights || []
						};
						filteredResults.push(result);
					}
				}

				// Handle any candidates missing from response
				for (let i = 0; i < batch.length; i++) {
					if (!batch[i].filterMetadata) {
						batch[i].filterMetadata = {
							isExternal: true,
							fitScore: 20,
							reasoning: 'Missing from batch response',
							matchingFactors: [],
							keyHighlights: []
						};
						filteredResults.push(batch[i]);
					}
				}
			} catch (error) {
				console.error(`Batch ${batchIdx} failed:`, error);
				for (const result of batch) {
					result.filterMetadata = {
						isExternal: true,
						fitScore: 20,
						reasoning: 'Batch filtering error',
						matchingFactors: [],
						keyHighlights: []
					};
					filteredResults.push(result);
				}
			}

			processed += batch.length;
			console.log(`Batch ${batchIdx + 1}/${batches.length} done (${processed}/${results.length} processed)`);

			if (searchId) {
				const currentFiltered = filteredResults.filter((r) => {
					if (!r.filterMetadata) return false;
					if (filters?.externalOnly && !r.filterMetadata.isExternal) return false;
					if (r.filterMetadata.fitScore < 40) return false;
					return true;
				}).sort((a, b) => (b.filterMetadata?.fitScore || 0) - (a.filterMetadata?.fitScore || 0));

				filterStateManager.updateProgress(searchId, processed, currentFiltered);
				// Also update export progress (65-90% range for filtering phase)
				const filterProgress = 65 + Math.round((processed / results.length) * 25);
				exportStateManager.updateProgress(searchId, filterProgress, filteredResults.length);
			}
		};

		// Run batches with concurrency limit
		const running: Promise<void>[] = [];
		for (let i = 0; i < batches.length; i++) {
			const startIdx = i * batchSize;
			const p = processBatch(batches[i], i, startIdx);
			running.push(p);

			if (running.length >= MAX_CONCURRENT_BATCHES) {
				await Promise.race(running);
				// Remove completed promises
				for (let j = running.length - 1; j >= 0; j--) {
					const status = await Promise.race([running[j].then(() => 'done'), Promise.resolve('pending')]);
					if (status === 'done') running.splice(j, 1);
				}
			}
		}
		await Promise.all(running);

		// For forceFilter mode (export), return ALL results with their filterMetadata
		// The caller will decide what to do with qualified vs unqualified
		if (forceFilter) {
			// Still filter by externalOnly if specified, but keep all fit scores
			let resultsToReturn = filteredResults;

			if (filters?.externalOnly) {
				resultsToReturn = filteredResults.filter(result => {
					if (!result.filterMetadata) return false;
					if (!result.filterMetadata.isExternal) {
						// Exception: include if they recently left
						if (filters?.includeRecentDepartures && result.filterMetadata.recentlyLeft) {
							return true;
						}
						return false;
					}
					return true;
				});
			}

			// Sort: recentlyLeft first, then by fit score
			resultsToReturn.sort((a, b) => {
				const aRecent = a.filterMetadata?.recentlyLeft ? 1 : 0;
				const bRecent = b.filterMetadata?.recentlyLeft ? 1 : 0;
				if (aRecent !== bRecent) return bRecent - aRecent;
				const scoreA = a.filterMetadata?.fitScore || 0;
				const scoreB = b.filterMetadata?.fitScore || 0;
				return scoreB - scoreA;
			});

			// Mark qualified based on fit score threshold
			const qualifiedCount = resultsToReturn.filter(r => (r.filterMetadata?.fitScore || 0) >= 40).length;

			console.log(`Analyzed ${resultsToReturn.length} candidates, ${qualifiedCount} qualified (fitScore >= 40)`);

			return {
				results: resultsToReturn,
				metadata: {
					total_results_before_filter: results.length,
					total_results_after_filter: resultsToReturn.length,
					total_qualified: qualifiedCount,
					filtering_applied: true
				}
			};
		}

		// Normal mode: Filter out internal candidates and low scores
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
	 * Bulk search for export - exhaustively fetches results using adaptive query generation.
	 * Exa has NO pagination (max 100 per query), so we generate varied queries to find more.
	 * Keeps generating new queries until they stop producing new unique results.
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
			queriesUsed: number;
			searchExhausted: boolean;
			stopReason: 'target_reached' | 'search_exhausted' | 'diminishing_returns';
		};
	}> {
		const seenUrls = new Set<string>();
		const allResults: SearchResult[] = [];
		const usedQueries: string[] = [];
		let pendingQueries: string[] = [...providedQueries];

		let round = 0;
		let totalRawSearched = 0;
		let stopReason: 'target_reached' | 'search_exhausted' | 'diminishing_returns' = 'search_exhausted';

		console.log(`[Bulk Search] Starting with ${pendingQueries.length} initial queries`);

		// Keep going until we run out of useful queries
		while (pendingQueries.length > 0) {
			round++;

			// Run all pending queries in parallel (100 results each - Exa max)
			console.log(`[Bulk Search] Round ${round}: Running ${pendingQueries.length} queries...`);

			const searchPromises = pendingQueries.map(query =>
				this.exa.searchPeople(query, { numResults: 100, includeText: false }).then(r => {
					return { results: r.results, query };
				}).catch(err => {
					console.error(`Query failed: "${query.substring(0, 50)}..."`, err.message);
					return { results: [], query };
				})
			);

			const responses = await Promise.all(searchPromises);

			// Mark queries as used
			usedQueries.push(...pendingQueries);
			pendingQueries = [];

			// Count raw results and deduplicate
			const rawThisRound = responses.reduce((sum, r) => sum + r.results.length, 0);
			totalRawSearched += rawThisRound;

			let newThisRound = 0;
			for (const response of responses) {
				for (const result of response.results) {
					if (!seenUrls.has(result.url)) {
						seenUrls.add(result.url);
						allResults.push(result);
						newThisRound++;
					}
				}
			}

			const yieldRate = rawThisRound > 0 ? (newThisRound / rawThisRound * 100).toFixed(1) : 0;
			console.log(`[Bulk Search] Round ${round}: Raw ${rawThisRound}, New ${newThisRound} (${yieldRate}% yield), Total ${allResults.length}`);

			if (onProgress) {
				onProgress({ totalRaw: totalRawSearched, unique: allResults.length, round });
			}

			// Check if we have enough
			if (allResults.length >= targetCount) {
				stopReason = 'target_reached';
				console.log(`[Bulk Search] Target reached: ${allResults.length} >= ${targetCount}`);
				break;
			}

			// Decide whether to generate more queries based on yield
			// If this round had good yield (>15%), generate more queries
			// If yield was low (<10%), we're likely exhausting the search space
			const shouldGenerateMore = rawThisRound === 0 || (newThisRound / Math.max(rawThisRound, 1)) > 0.10;

			if (shouldGenerateMore) {
				console.log(`[Bulk Search] Generating more queries (previous yield: ${yieldRate}%)...`);

				const newQueries = await this.claude.generateRecruitmentQueries(
					userQuery,
					filters?.excludeCurrentEmployer,
					filters?.geographicFocus,
					filters?.flexibleLocation ?? false,
					6, // Generate 6 new queries each round
					usedQueries // Pass all used queries as context to avoid duplicates
				);

				// Filter out queries we've already used (exact or very similar)
				for (const q of newQueries) {
					const isDuplicate = usedQueries.some(used =>
						used.toLowerCase() === q.toLowerCase() ||
						this.querySimilarity(used, q) > 0.8
					);
					if (!isDuplicate) {
						pendingQueries.push(q);
					}
				}

				console.log(`[Bulk Search] Generated ${newQueries.length} queries, ${pendingQueries.length} are new`);

				if (pendingQueries.length === 0) {
					stopReason = 'search_exhausted';
					console.log(`[Bulk Search] Can't generate new unique queries - search space exhausted`);
					break;
				}
			} else {
				// Low yield - check if we should stop or try one more batch
				console.log(`[Bulk Search] Low yield (${yieldRate}%) - trying one more query batch...`);

				const lastChanceQueries = await this.claude.generateRecruitmentQueries(
					userQuery,
					filters?.excludeCurrentEmployer,
					filters?.geographicFocus,
					filters?.flexibleLocation ?? false,
					4,
					usedQueries
				);

				for (const q of lastChanceQueries) {
					const isDuplicate = usedQueries.some(used =>
						used.toLowerCase() === q.toLowerCase() ||
						this.querySimilarity(used, q) > 0.8
					);
					if (!isDuplicate) {
						pendingQueries.push(q);
					}
				}

				if (pendingQueries.length === 0) {
					stopReason = 'diminishing_returns';
					console.log(`[Bulk Search] Diminishing returns - stopping`);
					break;
				}

				// Run this last batch, then check yield again
				// If still low, we'll stop in the next iteration
			}
		}

		console.log(`[Bulk Search] Complete: ${allResults.length} unique from ${totalRawSearched} raw, ${usedQueries.length} queries, ${round} rounds. Reason: ${stopReason}`);

		// Fetch text content for ALL unique URLs at once (saves ~24% on text costs)
		if (allResults.length > 0) {
			try {
				const contentsStart = Date.now();
				console.log(`[Bulk Search] Fetching text for ${allResults.length} unique profiles...`);
				const uniqueUrls = allResults.map(r => r.url);
				const contents = await this.exa.getContents(uniqueUrls);
				const textMap = new Map(contents.map(c => [c.url, c.text]));

				// Merge text into results
				for (const result of allResults) {
					result.text = textMap.get(result.url) || '';
				}
				console.log(`[Bulk Search] Fetched text for ${contents.length} profiles in ${Date.now() - contentsStart}ms`);
			} catch (error) {
				console.error('[Bulk Search] Failed to fetch contents, proceeding without text:', error);
			}
		}

		return {
			results: allResults,
			stats: {
				totalRawSearched,
				totalAfterDedup: allResults.length,
				rounds: round,
				queriesUsed: usedQueries.length,
				searchExhausted: stopReason === 'search_exhausted',
				stopReason
			}
		};
	}

	/**
	 * Simple query similarity check (Jaccard similarity on words)
	 */
	private querySimilarity(a: string, b: string): number {
		const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
		const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
		const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
		const union = new Set([...wordsA, ...wordsB]).size;
		return union > 0 ? intersection / union : 0;
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
			const generated = await this.claude.generateRecruitmentQueries(
				refinedQuery.refined,
				filters?.excludeCurrentEmployer,
				filters?.geographicFocus
			);

			searchQueries.push(...generated);
			queriesGenerated = true;

			console.log(`Generated ${searchQueries.length} search queries:`, searchQueries);
		}

		// Step 2: Run all queries in parallel WITHOUT text (cheaper)
		console.log(`Searching with ${searchQueries.length} queries (100 results each, no text)...`);

		const searchPromises = searchQueries.map(query =>
			this.exa.searchPeople(query, { numResults: 100, includeText: false })
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

		console.log(`Found ${uniqueResults.length} unique profiles (deduped, fetching text...)`);

		// Step 4: Fetch text content ONLY for unique URLs
		if (uniqueResults.length > 0) {
			try {
				const uniqueUrls = uniqueResults.map(r => r.url);
				const contents = await this.exa.getContents(uniqueUrls);
				const textMap = new Map(contents.map(c => [c.url, c.text]));

				for (const result of uniqueResults) {
					result.text = textMap.get(result.url) || '';
				}
				console.log(`Fetched text for ${contents.length} unique profiles`);
			} catch (error) {
				console.error('Failed to fetch contents:', error);
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

					const filterResult = await this.claude.filterAndRankCandidate(
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
						currentEmployer: undefined,
						matchingFactors: [],
						keyHighlights: []
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
