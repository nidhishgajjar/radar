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
	 * Generate multiple recruitment search queries from a job description.
	 */
	async generateRecruitmentQueries(
		jobDescription: string,
		excludeEmployer?: string,
		geographicFocus?: string[],
		flexibleLocation: boolean = false,
		numQueries: number = 4,
		previousQueries?: string[]
	): Promise<string[]> {
		// Extract location from job description for strict filtering
		const locationMatch = jobDescription.match(/\b(Toronto|Vancouver|Calgary|Edmonton|Ottawa|Montreal|Winnipeg|Halifax|Victoria|BC|Ontario|Alberta|Quebec|Canada|USA|New York|San Francisco|Seattle|Boston|Chicago|Los Angeles|Austin|Denver|Miami|Atlanta)\b/gi);
		const detectedLocation = locationMatch ? [...new Set(locationMatch)].join(', ') : null;

		const geoContext = geographicFocus?.length
			? `Focus on these regions: ${geographicFocus.join(', ')}`
			: detectedLocation
				? `STRICT LOCATION: Only search for candidates in or near ${detectedLocation}`
				: 'Search across Canada and USA';

		const locationRule = flexibleLocation
			? 'Location is flexible - include nearby regions'
			: detectedLocation
				? `CRITICAL: Every query MUST include "${detectedLocation}" - only find candidates in this specific location`
				: '';

		const excludeContext = excludeEmployer
			? `CRITICAL: Exclude anyone currently at "${excludeEmployer}"`
			: '';

		const previousContext = previousQueries?.length
			? `\nALREADY USED (generate DIFFERENT queries, not these):\n${previousQueries.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nGenerate NEW angles that haven't been tried.`
			: '';

		const systemPrompt = `You are an executive recruiter generating LinkedIn search queries to find EXTERNAL candidates.

Job: ${jobDescription}

${geoContext}
${locationRule}
${excludeContext}
${previousContext}

Generate ${numQueries} ${previousQueries?.length ? 'NEW and DIFFERENT' : 'different'} search queries that will find RECRUITABLE external candidates:

RULES:
1. Focus on similar roles at OTHER organizations${excludeEmployer ? ` (not ${excludeEmployer})` : ''}
2. ${detectedLocation && !flexibleLocation ? `MANDATORY: Include "${detectedLocation}" in EVERY query` : 'Include geographic locations from the job description'}
3. Use the EXACT job title from the description (e.g., "Executive Director" not just "Director")
4. Include industry/domain keywords (healthcare, technology, finance, etc.)
5. Each query should target different candidate pools - vary titles, industries, related roles
6. Think creatively: include adjacent roles, related industries, competitor companies${previousQueries?.length ? '\n7. MUST be completely different from already-used queries - try synonyms, related titles, adjacent industries' : ''}

Return ONLY a JSON array of ${numQueries} search query strings.`;

		try {
			const data = await this.fetchWithRetry({
				system: systemPrompt,
				prompt: jobDescription,
				timeoutMs: 20000
			});

			const content = data.content.trim();

			// Parse JSON array from response
			try {
				const queries = JSON.parse(content);
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

			// Fallback: use original job description
			return [jobDescription];
		} catch (error) {
			console.error('Failed to generate recruitment queries:', error);
			return [jobDescription];
		}
	}

	/**
	 * Filter and rank a candidate profile against job requirements.
	 */
	async filterAndRankCandidate(
		profile: string,
		jobDescription: string,
		excludeEmployer?: string,
		minYearsExperience?: number
	): Promise<{
		currentEmployer?: string;
		isExternal: boolean;
		fitScore: number;
		reasoning: string;
		recentlyLeft?: boolean;
		keyHighlights?: string[];
	}> {
		const prompt = `${excludeEmployer ? `HIRING COMPANY: "${excludeEmployer}" - if they work there, isExternal:false, fitScore:15.\n` : ''}Job: ${jobDescription.substring(0, 300)}
Profile: ${profile.substring(0, 800)}
Return JSON only: {"currentEmployer":"name","isExternal":bool,"fitScore":0-100,"keyHighlights":["h1","h2"],"reasoning":"brief"}`;

		try {
			const data = await this.fetchWithRetry({
				prompt,
				timeoutMs: 45000
			});

			const content = data.content.trim();

			try {
				return JSON.parse(content);
			} catch {
				// Fallback: assume external, low score
				return {
					currentEmployer: undefined,
					isExternal: true,
					fitScore: 40,
					reasoning: 'Unable to parse LLM response',
					recentlyLeft: false,
					keyHighlights: []
				};
			}
		} catch (error) {
			console.error('Failed to filter candidate:', error);
			return {
				currentEmployer: undefined,
				isExternal: true,
				fitScore: 40,
				reasoning: 'Error during filtering',
				recentlyLeft: false,
				keyHighlights: []
			};
		}
	}

	/**
	 * Extract search requirements from a job posting/URL content.
	 */
	async extractRequirementsFromJob(jobContent: string): Promise<string> {
		const systemPrompt = `You are a candidate search query generator for recruiters.

You receive a job description and output a search query to find CANDIDATES who would be good fit for this role.

CRITICAL: We are looking for POTENTIAL CANDIDATES to hire, NOT current employees at the company posting the job.

Extract and format:
1. Job title/role (without company name)
2. Core skills and technologies
3. Years of experience level
4. Location if mentioned
5. Industry experience

RULES:
1. Focus on candidate qualifications, not company name
2. Use professional terminology candidates use in profiles
3. Include seniority level (junior, mid, senior, lead, principal, staff)
4. Keep query under 100 characters
5. Return ONLY the search query - no explanations or context

EXAMPLES:
Input: "Shopify is hiring a Senior React Developer with 5+ years experience in TypeScript, Node.js, and AWS in Toronto"
Output: "Senior React Developer TypeScript Node.js AWS Toronto 5+ years"

Input: "Google seeks Principal Engineer for distributed systems team in Vancouver"
Output: "Principal Engineer distributed systems Vancouver cloud architecture"

Input: "Looking for Marketing Director with B2B SaaS experience in Vancouver"
Output: "Marketing Director B2B SaaS Vancouver growth marketing"`;

		const data = await this.fetchWithRetry({
			system: systemPrompt,
			prompt: jobContent,
			timeoutMs: 15000
		});

		const extractedQuery = data.content.trim();

		// Validate the extracted query
		if (extractedQuery.length === 0 || extractedQuery.length > 200) {
			console.warn('Invalid extracted query length, returning original');
			return jobContent.substring(0, 200);
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
