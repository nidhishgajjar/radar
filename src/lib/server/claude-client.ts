/**
 * Claude API Client - Replacement for OpenRouterClient.
 *
 * Calls the local Claude API server (scripts/claude-api-server.cjs) which
 * wraps `claude -p` for simple prompt/response LLM calls.
 */

import {
	ClaudeError,
	ClaudeErrorType,
	type ClaudePromptRequest,
	type ClaudePromptResponse
} from '$lib/types/claude';
import { withRetry } from '$lib/utils/retry';
import { countTokens } from '@anthropic-ai/tokenizer';

const CLAUDE_API_URL = process.env.CLAUDE_API_URL || 'http://localhost:3001';
const DEFAULT_TIMEOUT_MS = 30000;

export class ClaudeClient {
	private baseUrl: string;

	// Session tracking (for compatibility with OpenRouterClient interface)
	private static sessionRequests = 0;

	constructor() {
		this.baseUrl = CLAUDE_API_URL;
	}

	/**
	 * Make a request to the Claude API server with retry logic.
	 */
	private async fetchWithRetry(
		request: ClaudePromptRequest,
		timeoutMs?: number
	): Promise<ClaudePromptResponse> {
		const requestTimeout = timeoutMs || request.timeoutMs || DEFAULT_TIMEOUT_MS;

		return withRetry(
			async () => {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

				try {
					const response = await fetch(`${this.baseUrl}/prompt`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(request),
						signal: controller.signal
					});

					clearTimeout(timeoutId);

					if (!response.ok) {
						const data = await response.json().catch(() => ({}));

						if (response.status === 401 || data.error === 'auth_failed') {
							throw new ClaudeError(
								'Claude authentication failed',
								ClaudeErrorType.AUTHENTICATION,
								401
							);
						}

						throw new ClaudeError(
							data.error || `HTTP ${response.status}`,
							ClaudeErrorType.SERVER_ERROR,
							response.status
						);
					}

					const data = await response.json();
					ClaudeClient.sessionRequests++;
					return data;

				} catch (error) {
					clearTimeout(timeoutId);

					if (error instanceof ClaudeError) {
						throw error;
					}

					if (error instanceof Error && error.name === 'AbortError') {
						throw new ClaudeError('Request timeout', ClaudeErrorType.TIMEOUT);
					}

					// Connection refused = server not running
					if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
						throw new ClaudeError(
							'Claude API server not running. Start it with: node scripts/claude-api-server.cjs',
							ClaudeErrorType.NETWORK
						);
					}

					throw new ClaudeError(
						`Network error: ${error instanceof Error ? error.message : 'Unknown'}`,
						ClaudeErrorType.NETWORK
					);
				}
			},
			{
				maxRetries: 3,
				initialDelayMs: 1000,
				retryableErrors: (error) => {
					if (error instanceof ClaudeError) {
						// Retry on timeout, network, and server errors (not auth)
						return [
							ClaudeErrorType.TIMEOUT,
							ClaudeErrorType.NETWORK,
							ClaudeErrorType.SERVER_ERROR
						].includes(error.type);
					}
					return false;
				},
				onRetry: (attempt, error, delayMs) => {
					console.log(`[Claude] Retry ${attempt}/3 after ${delayMs}ms:`, error?.message || error);
				}
			}
		);
	}

	/**
	 * Get session statistics (for compatibility).
	 */
	static getSessionStats(): { requests: number } {
		return { requests: ClaudeClient.sessionRequests };
	}

	/**
	 * Reset session stats.
	 */
	static resetSessionStats(): void {
		ClaudeClient.sessionRequests = 0;
	}

	/**
	 * Get session cost (for compatibility with OpenRouterClient interface).
	 * Note: Claude Code doesn't expose detailed cost info, so we estimate based on request count.
	 */
	static getSessionCost(): { cost: number; tokens: { input: number; output: number }; requests: number } {
		// Rough estimate: ~$0.01 per request for typical short prompts
		const estimatedCostPerRequest = 0.01;
		return {
			cost: ClaudeClient.sessionRequests * estimatedCostPerRequest,
			tokens: { input: 0, output: 0 }, // Not tracked
			requests: ClaudeClient.sessionRequests
		};
	}

	/**
	 * Reset session cost tracking (for compatibility with OpenRouterClient interface).
	 */
	static resetSessionCost(): void {
		ClaudeClient.sessionRequests = 0;
	}

	/**
	 * Refine a user search query into a keyword-rich search string.
	 */
	async refineQuery(userQuery: string): Promise<string> {
		const systemPrompt = `You are a talent search query optimizer for LinkedIn profiles in Canada.

Transform natural language queries into precise, keyword-rich search strings.

RULES:
1. Extract key signals: job titles, skills, companies, locations, seniority
2. Preserve Canadian context (cities, provinces)
3. Use professional terminology
4. Keep query under 100 characters
5. Return ONLY the refined query string - no explanations

EXAMPLES:
Input: "nurses in Hamilton with verified licenses"
Output: "Registered Nurse RN Hamilton Ontario Canada license certification"

Input: "senior data scientists at tech companies in Toronto"
Output: "Senior Data Scientist Toronto Canada tech company machine learning"

Input: "marketing directors with SaaS experience"
Output: "Marketing Director Canada SaaS software B2B experience"`;

		const data = await this.fetchWithRetry({
			system: systemPrompt,
			prompt: userQuery,
			timeoutMs: 15000
		});

		const refinedQuery = data.content.trim();

		// Validate the refined query
		if (refinedQuery.length === 0 || refinedQuery.length > 200) {
			console.warn('Invalid refined query length, using original');
			return userQuery;
		}

		return refinedQuery;
	}

	/**
	 * Generate multiple search queries from a people search description.
	 */
	async generateSearchQueries(
		searchQuery: string,
		excludeCompany?: string,
		geographicFocus?: string[],
		flexibleLocation: boolean = false,
		numQueries: number = 4,
		previousQueries?: string[]
	): Promise<string[]> {
		// Extract location from search query for strict filtering
		const locationMatch = searchQuery.match(/\b(Toronto|Vancouver|Calgary|Edmonton|Ottawa|Montreal|Winnipeg|Halifax|Victoria|BC|Ontario|Alberta|Quebec|Canada|USA|New York|San Francisco|Seattle|Boston|Chicago|Los Angeles|Austin|Denver|Miami|Atlanta)\b/gi);
		const detectedLocation = locationMatch ? [...new Set(locationMatch)].join(', ') : null;

		const geoContext = geographicFocus?.length
			? `Focus on these regions: ${geographicFocus.join(', ')}`
			: detectedLocation
				? `STRICT LOCATION: Only search for people in or near ${detectedLocation}`
				: 'Search across Canada and USA';

		const locationRule = flexibleLocation
			? 'Location is flexible - include nearby regions'
			: detectedLocation
				? `CRITICAL: Every query MUST include "${detectedLocation}" - only find people in this specific location`
				: '';

		const excludeContext = excludeCompany
			? `CRITICAL: Exclude anyone currently at "${excludeCompany}"`
			: '';

		const previousContext = previousQueries?.length
			? `\nALREADY USED (generate DIFFERENT queries, not these):\n${previousQueries.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nGenerate NEW angles that haven't been tried.`
			: '';

		const systemPrompt = `You are a people search specialist generating LinkedIn search queries to find relevant profiles.

Search Intent: ${searchQuery}

${geoContext}
${locationRule}
${excludeContext}
${previousContext}

Generate ${numQueries} ${previousQueries?.length ? 'NEW and DIFFERENT' : 'different'} search queries that will find matching profiles:

RULES:
1. Focus on people at various organizations${excludeCompany ? ` (not ${excludeCompany})` : ''}
2. ${detectedLocation && !flexibleLocation ? `MANDATORY: Include "${detectedLocation}" in EVERY query` : 'Include geographic locations from the search intent'}
3. Use the EXACT titles/roles from the description (e.g., "Founder" not just "Entrepreneur")
4. Include industry/domain keywords (DTC, Consumer Goods, CPG, etc.)
5. Each query should target different pools - vary titles, industries, related roles
6. Think creatively: include adjacent roles, related industries, competitor companies${previousQueries?.length ? '\n7. MUST be completely different from already-used queries - try synonyms, related titles, adjacent industries' : ''}

Return ONLY a JSON array of ${numQueries} search query strings.`;

		try {
			const data = await this.fetchWithRetry({
				system: systemPrompt,
				prompt: searchQuery,
				timeoutMs: 20000
			});

			const content = data.content.trim();

			// Parse JSON array from response (extract from code fences if present)
			try {
				const fenceMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
				const jsonStr = fenceMatch ? fenceMatch[1].trim() : content.trim();
				const queries = JSON.parse(jsonStr);
				if (Array.isArray(queries) && queries.length > 0) {
					return queries;
				}
			} catch {
				// If not valid JSON, try to extract queries from text
				const lines = content.split('\n').filter(line => line.trim().startsWith('-') || line.trim().startsWith('"'));
				if (lines.length > 0) {
					return lines.map(line => line.replace(/^[-"\s]+|["]+$/g, '').trim());
				}
			}

			// Fallback: use original search query
			return [searchQuery];
		} catch (error) {
			console.error('Failed to generate search queries:', error);
			return [searchQuery];
		}
	}

	/**
	 * Filter and rank a person's profile against search criteria.
	 * Accepts optional company context from LinkedIn page enrichment.
	 */
	async filterAndRankPerson(
		profile: string,
		searchQuery: string,
		excludeCompany?: string,
		companyContext?: string
	): Promise<{
		currentEmployer?: string;
		isExternal: boolean;
		fitScore: number;
		reasoning: string;
		recentlyLeft?: boolean;
		matchingFactors?: string[];
		keyHighlights?: string[];
	}> {
		const prompt = `${excludeCompany ? `EXCLUDE COMPANY: "${excludeCompany}" - if they currently work there, isExternal:false, fitScore:15.\n` : ''}Search: ${searchQuery.substring(0, 500)}

Profile: ${profile}
${companyContext ? `\nCurrent Company: ${companyContext}` : ''}
Return JSON only: {"currentEmployer":"name","isExternal":bool,"fitScore":0-100,"matchingFactors":["factor1","factor2","factor3"],"reasoning":"2-3 sentence explanation"}`;

		try {
			const data = await this.fetchWithRetry({
				prompt,
				timeoutMs: 45000
			});

			const content = data.content.trim();

			try {
				// Extract JSON from response - handles preamble text + code fences
				const fenceMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
				const jsonStr = fenceMatch ? fenceMatch[1].trim() : content.trim();
				const parsed = JSON.parse(jsonStr);
				// Normalize: support both matchingFactors and legacy keyHighlights
				if (parsed.matchingFactors && !parsed.keyHighlights) {
					parsed.keyHighlights = parsed.matchingFactors;
				}
				return parsed;
			} catch {
				return {
					currentEmployer: undefined,
					isExternal: true,
					fitScore: 20,
					reasoning: 'Unable to parse response',
					matchingFactors: [],
					keyHighlights: []
				};
			}
		} catch (error) {
			console.error('Failed to filter person:', error);
			return {
				currentEmployer: undefined,
				isExternal: true,
				fitScore: 20,
				reasoning: 'Filtering failed',
				matchingFactors: [],
				keyHighlights: []
			};
		}
	}

	/**
	 * Count tokens using the official Anthropic tokenizer.
	 */
	private countTokens(text: string): number {
		return countTokens(text);
	}

	/**
	 * Filter and rank a BATCH of people in a single LLM call.
	 * Estimates tokens and auto-splits into sub-batches if prompt exceeds MAX_TOKENS.
	 */
	async filterPeopleBatch(
		people: Array<{
			id: number;
			profile: string;
			companyContext?: string;
		}>,
		searchQuery: string,
		excludeCompany?: string
	): Promise<Array<{
		id: number;
		currentEmployer?: string;
		isExternal: boolean;
		fitScore: number;
		reasoning: string;
		recentlyLeft?: boolean;
		matchingFactors?: string[];
		keyHighlights?: string[];
	}>> {
		const MAX_INPUT_TOKENS = 120000; // Leave headroom under 150K context

		// Build scoring rubric
		const rubric = `SCORING RUBRIC (0-100):
90-100: Exact match - title, industry, seniority, location, and company profile all align precisely with search intent
75-89: Strong match - most criteria match, may differ in one dimension (e.g., slightly different title but same function/industry)
60-74: Good match - relevant experience and background, adjacent title/industry or slightly different seniority
40-59: Partial match - some overlap in skills or industry but differs in seniority, function, or company type
20-39: Weak match - minimal relevance, different field or function, tangential connection at best
0-19: No match - completely unrelated to search criteria

SCORING DIMENSIONS:
1. Role/Title alignment - how closely does their current/recent role match what's being searched for?
2. Industry/Domain fit - are they in the right industry or directly adjacent?
3. Seniority level - does their career level match the intent (founder, VP, IC, etc.)?
4. Company profile match - does their company type match (startup vs enterprise, D2C vs B2B, headcount range)?
5. Geographic relevance - are they in the right location if specified?
6. Career trajectory - does their career path suggest they're the kind of person being searched for?`;

		// Build the prompt to estimate total tokens
		const headerText = `${excludeCompany ? `EXCLUDE COMPANY: "${excludeCompany}"\n` : ''}Search Intent: ${searchQuery}\n\n${rubric}`;
		const footerText = `\nEvaluate EVERY person above using the rubric. Return a JSON array with exactly ${people.length} objects.\nEach object: {"id":N,"currentEmployer":"name","isExternal":bool,"fitScore":0-100,"matchingFactors":["f1","f2","f3"],"reasoning":"1-2 sentences"}`;
		const overheadTokens = this.countTokens(headerText + footerText);

		// Calculate per-person token cost - NO TRUNCATION, send full profile + all company fields
		const personTexts = people.map(p => {
			const parts = [`[Person ${p.id}]\nTitle: ${p.profile.split('\n')[0]}\nURL: ${p.profile.split('\n')[1]}\nProfile:\n${p.profile.split('Profile:\n')[1] || p.profile}`];
			if (p.companyContext) parts.push(`\nCompany Context: ${p.companyContext}`);
			return parts.join('\n');
		});
		const totalTokens = overheadTokens + this.countTokens(personTexts.join('\n\n---\n\n'));

		// Auto-split if exceeds limit
		if (totalTokens > MAX_INPUT_TOKENS && people.length > 1) {
			const numSplits = Math.ceil(totalTokens / MAX_INPUT_TOKENS);
			const splitSize = Math.ceil(people.length / numSplits);
			console.log(`[Claude] Batch of ${people.length} (~${totalTokens} tokens) exceeds ${MAX_INPUT_TOKENS}. Splitting into ${numSplits} sub-batches of ~${splitSize}`);

			const allResults: Array<{
				id: number; currentEmployer?: string; isExternal: boolean;
				fitScore: number; reasoning: string; recentlyLeft?: boolean;
				matchingFactors?: string[]; keyHighlights?: string[];
			}> = [];

			for (let i = 0; i < people.length; i += splitSize) {
				const subBatch = people.slice(i, i + splitSize);
				const subResults = await this.filterPeopleBatch(subBatch, searchQuery, excludeCompany);
				allResults.push(...subResults);
			}
			return allResults;
		}

		const personBlocks = personTexts.join('\n\n---\n\n');

		const prompt = `${excludeCompany ? `EXCLUDE COMPANY: "${excludeCompany}" — if person currently works there, isExternal:false, fitScore:15.\n\n` : ''}Search Intent: ${searchQuery}

${rubric}

${personBlocks}

Evaluate EVERY person above using the scoring rubric. Return a JSON array with exactly ${people.length} objects, one per person in order.
Each object: {"id":<number>,"currentEmployer":"name","isExternal":true/false,"fitScore":0-100,"matchingFactors":["factor1","factor2","factor3"],"reasoning":"1-2 sentences explaining the score"}
Return ONLY the JSON array, no other text.`;

		try {
			const data = await this.fetchWithRetry({
				prompt,
				timeoutMs: 120000 // 2min for large batches
			});

			const content = data.content.trim();
			const fenceMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
			const jsonStr = fenceMatch ? fenceMatch[1].trim() : content.trim();
			const parsed = JSON.parse(jsonStr);

			if (Array.isArray(parsed)) {
				return parsed.map((item: Record<string, unknown>) => {
					if (item.matchingFactors && !item.keyHighlights) {
						item.keyHighlights = item.matchingFactors;
					}
					return item as {
						id: number;
						currentEmployer?: string;
						isExternal: boolean;
						fitScore: number;
						reasoning: string;
						recentlyLeft?: boolean;
						matchingFactors?: string[];
						keyHighlights?: string[];
					};
				});
			}

			// If not an array, return fallbacks
			console.warn('[Claude] Batch response was not an array, returning fallbacks');
			return people.map(p => ({
				id: p.id,
				isExternal: true,
				fitScore: 20,
				reasoning: 'Batch parse error',
				matchingFactors: [],
				keyHighlights: []
			}));
		} catch (error) {
			console.error('[Claude] Batch filtering failed:', error);
			return people.map(p => ({
				id: p.id,
				isExternal: true,
				fitScore: 20,
				reasoning: 'Batch filtering failed',
				matchingFactors: [],
				keyHighlights: []
			}));
		}
	}

	/**
	 * Extract search intent from a detailed description or URL content.
	 */
	async extractSearchIntent(content: string): Promise<string> {
		const systemPrompt = `You are a people search query optimizer.

You receive a detailed description or webpage content and output a concise search query to find matching people.

Extract and format:
1. Key roles/titles being searched for
2. Core skills, domains, or industries
3. Experience level or seniority
4. Location if mentioned
5. Company characteristics (size, type, industry)

RULES:
1. Focus on person characteristics, not organizations
2. Use professional terminology people use in profiles
3. Include seniority level (founder, C-level, VP, director, senior, etc.)
4. Keep query focused and under 150 characters
5. Return ONLY the search query - no explanations or context

EXAMPLES:
Input: "Find founders of DTC brands in Toronto with 11-50 employees in the health and wellness space"
Output: "Founder CEO DTC Consumer Brand Health Wellness Toronto 11-50 employees"

Input: "Looking for VPs of Engineering at fintech startups in Vancouver with Series A/B funding"
Output: "VP Engineering fintech startup Vancouver Series A B funding"

Input: "Product designers with experience at top tech companies in the Bay Area"
Output: "Product Designer FAANG tech company San Francisco Bay Area"`;

		const data = await this.fetchWithRetry({
			system: systemPrompt,
			prompt: content,
			timeoutMs: 15000
		});

		const extractedQuery = data.content.trim();

		// Validate the extracted query
		if (extractedQuery.length === 0 || extractedQuery.length > 200) {
			console.warn('Invalid extracted query length, returning original');
			return content.substring(0, 200);
		}

		return extractedQuery;
	}

	/**
	 * Check if the Claude API server is healthy.
	 */
	async checkHealth(): Promise<{ connected: boolean; hasToken: boolean }> {
		try {
			const response = await fetch(`${this.baseUrl}/health`, {
				signal: AbortSignal.timeout(3000)
			});
			if (!response.ok) {
				return { connected: false, hasToken: false };
			}
			const data = await response.json();
			return { connected: true, hasToken: !!data.hasToken };
		} catch {
			return { connected: false, hasToken: false };
		}
	}
}
