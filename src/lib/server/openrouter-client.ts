import {
	OpenRouterError,
	OpenRouterErrorType,
	type OpenRouterRequest,
	type OpenRouterResponse
} from '$lib/types/openrouter';
import {
	OPENROUTER_API_KEY,
	OPENROUTER_MODEL,
	OPENROUTER_TIMEOUT_MS
} from '$env/static/private';
import { withRetry } from '$lib/utils/retry';

// Fallback cost calculation for Grok Fast: $0.20/1M input, $0.50/1M output
const COST_PER_INPUT_TOKEN = 0.20 / 1_000_000;
const COST_PER_OUTPUT_TOKEN = 0.50 / 1_000_000;

export class OpenRouterClient {
	private apiKey: string;
	private model: string;
	private timeout: number;
	private baseUrl = 'https://openrouter.ai/api/v1';

	// Session cost tracking
	private static sessionCost = 0;
	private static sessionTokens = { input: 0, output: 0 };
	private static requestCount = 0;

	constructor() {
		if (!OPENROUTER_API_KEY) {
			throw new Error('OPENROUTER_API_KEY is not configured');
		}
		this.apiKey = OPENROUTER_API_KEY;
		this.model = OPENROUTER_MODEL || 'x-ai/grok-4.1-fast';
		this.timeout = parseInt(OPENROUTER_TIMEOUT_MS || '5000');
	}

	/**
	 * Track token usage and cost from OpenRouter response
	 */
	private trackUsage(usage?: { prompt_tokens: number; completion_tokens: number; cost?: number }) {
		if (!usage) return;

		// Use actual cost from OpenRouter if available, otherwise calculate
		const totalCost = usage.cost ??
			(usage.prompt_tokens * COST_PER_INPUT_TOKEN + usage.completion_tokens * COST_PER_OUTPUT_TOKEN);

		OpenRouterClient.sessionTokens.input += usage.prompt_tokens;
		OpenRouterClient.sessionTokens.output += usage.completion_tokens;
		OpenRouterClient.sessionCost += totalCost;
		OpenRouterClient.requestCount++;
	}

	/**
	 * Get current session cost summary
	 */
	static getSessionCost(): { cost: number; tokens: { input: number; output: number }; requests: number } {
		return {
			cost: OpenRouterClient.sessionCost,
			tokens: { ...OpenRouterClient.sessionTokens },
			requests: OpenRouterClient.requestCount
		};
	}

	/**
	 * Reset session cost tracking
	 */
	static resetSessionCost(): void {
		OpenRouterClient.sessionCost = 0;
		OpenRouterClient.sessionTokens = { input: 0, output: 0 };
		OpenRouterClient.requestCount = 0;
	}

	/**
	 * Log session cost summary
	 */
	static logSessionCost(label?: string): void {
		const { cost, tokens, requests } = OpenRouterClient.getSessionCost();
		console.log(`[LLM Cost${label ? ` - ${label}` : ''}] ${requests} requests, ${tokens.input + tokens.output} tokens, $${cost.toFixed(4)}`);
	}

	/**
	 * Make an API request with retry logic for rate limits and transient errors
	 */
	private async fetchWithRetry(request: OpenRouterRequest, timeoutMs?: number): Promise<OpenRouterResponse> {
		const requestTimeout = timeoutMs || this.timeout;
		return withRetry(
			async () => {
				const controller = new AbortController();
				const timeoutId = setTimeout(() => controller.abort(), requestTimeout);

				try {
					const response = await fetch(`${this.baseUrl}/chat/completions`, {
						method: 'POST',
						headers: {
							Authorization: `Bearer ${this.apiKey}`,
							'Content-Type': 'application/json',
							'HTTP-Referer': 'https://radar.jobs.ca',
							'X-Title': 'Radar by jobs.ca'
						},
						body: JSON.stringify(request),
						signal: controller.signal
					});

					clearTimeout(timeoutId);

					if (!response.ok) {
						throw await this.handleErrorResponse(response);
					}

					const data = await response.json() as OpenRouterResponse;

					// Track usage and cost from response
					this.trackUsage(data.usage);

					return data;
				} catch (error) {
					clearTimeout(timeoutId);

					if (error instanceof OpenRouterError) {
						throw error;
					}

					if (error instanceof Error && error.name === 'AbortError') {
						throw new OpenRouterError('Request timeout', OpenRouterErrorType.TIMEOUT);
					}

					throw new OpenRouterError(
						`Network error: ${error instanceof Error ? error.message : 'Unknown'}`,
						OpenRouterErrorType.NETWORK
					);
				}
			},
			{
				maxRetries: 3,
				initialDelayMs: 1000,
				retryableErrors: (error) => {
					if (error instanceof OpenRouterError) {
						return [
							OpenRouterErrorType.RATE_LIMIT,
							OpenRouterErrorType.MODEL_OVERLOADED,
							OpenRouterErrorType.SERVER_ERROR,
							OpenRouterErrorType.NETWORK,
							OpenRouterErrorType.TIMEOUT
						].includes(error.type);
					}
					return false;
				},
				onRetry: (attempt, error, delayMs) => {
					console.log(`[OpenRouter] Retry ${attempt}/3 after ${delayMs}ms:`, error?.message || error);
				}
			}
		);
	}

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

		const request: OpenRouterRequest = {
			model: this.model,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userQuery }
			],
			temperature: 0.2,
			max_tokens: 100
		};

		const data = await this.fetchWithRetry(request);

		if (!data.choices || data.choices.length === 0) {
			throw new OpenRouterError(
				'No response from model',
				OpenRouterErrorType.SERVER_ERROR
			);
		}

		const refinedQuery = data.choices[0].message.content.trim();

		// Validate the refined query
		if (refinedQuery.length === 0 || refinedQuery.length > 200) {
			console.warn('Invalid refined query length, using original');
			return userQuery;
		}

		return refinedQuery;
	}

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

		const request: OpenRouterRequest = {
			model: this.model, // Use Grok Fast
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: jobDescription }
			],
			temperature: 0.4, // Slightly higher for more variety in queries
			max_tokens: numQueries * 80 // ~80 tokens per query
		};

		try {
			const data = await this.fetchWithRetry(request);

			if (!data.choices || data.choices.length === 0) {
				throw new OpenRouterError(
					'No response from model',
					OpenRouterErrorType.SERVER_ERROR
				);
			}

			const content = data.choices[0].message.content.trim();

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
			// Fallback to original query
			return [jobDescription];
		}
	}

	async filterAndRankCandidate(
		profile: string,
		jobDescription: string,
		excludeEmployer?: string,
		minYearsExperience?: number,
		companyData?: {
			headcount?: number;
			revenue?: string;
			funding?: string;
			industry?: string;
		}
	): Promise<{
		currentEmployer?: string;
		isExternal: boolean;
		fitScore: number;
		reasoning: string;
		recentlyLeft?: boolean;
		keyHighlights?: string[];
	}> {
		// Build company context if available
		const companyContext = companyData ? `
Company Data (verified):
- Headcount: ${companyData.headcount || 'Unknown'}
- Revenue: ${companyData.revenue || 'Unknown'}
- Funding: ${companyData.funding || 'Unknown'}
- Industry: ${companyData.industry || 'Unknown'}` : '';

		// Use Grok Fast for filtering
		const prompt = `Analyze LinkedIn profile for job fit.
Job: ${jobDescription}
${excludeEmployer ? `Exclude if at: ${excludeEmployer}` : ''}

Profile:
${profile.substring(0, 1500)}
${companyContext}

Analyze:
1. currentEmployer: Their CURRENT company (or null if unclear/unemployed)
2. isExternal: true if NOT currently at the hiring company
3. fitScore: 0-100 based on skills/experience match${companyData ? ' AND company criteria (headcount, revenue if specified in job)' : ''}
4. recentlyLeft: true if they show "Former" or left a relevant role in last 6 months (look for dates like "2024", "Present" endings)
5. keyHighlights: Array of 2-3 brief highlights that make this person a good fit (e.g., "10+ years experience", "Led team of 15", "AWS certified"${companyData ? ', "$X revenue company"' : ''})
6. reasoning: Brief explanation

Return JSON only: {"currentEmployer":"name or null","isExternal":true/false,"fitScore":0-100,"recentlyLeft":true/false,"keyHighlights":["highlight1","highlight2"],"reasoning":"brief"}`;

		const request: OpenRouterRequest = {
			model: this.model, // Grok Fast
			messages: [
				{ role: 'user', content: prompt }
			],
			temperature: 0.1,
			max_tokens: 100
		};

		try {
			// Longer timeout for filtering (15s) since we run many in parallel
			const data = await this.fetchWithRetry(request, 15000);

			if (!data.choices || data.choices.length === 0) {
				throw new OpenRouterError(
					'No response from model',
					OpenRouterErrorType.SERVER_ERROR
				);
			}

			const content = data.choices[0].message.content.trim();

			try {
				const result = JSON.parse(content);
				return result;
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
			// Fallback: assume external, low score
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

		const request: OpenRouterRequest = {
			model: this.model,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: jobContent }
			],
			temperature: 0.2,
			max_tokens: 150
		};

		const data = await this.fetchWithRetry(request);

		if (!data.choices || data.choices.length === 0) {
			throw new OpenRouterError(
				'No response from model',
				OpenRouterErrorType.SERVER_ERROR
			);
		}

		const extractedQuery = data.choices[0].message.content.trim();

		// Validate the extracted query
		if (extractedQuery.length === 0 || extractedQuery.length > 200) {
			console.warn('Invalid extracted query length, returning original');
			return jobContent.substring(0, 200);
		}

		return extractedQuery;
	}

	private async handleErrorResponse(response: Response): Promise<OpenRouterError> {
		const status = response.status;
		let errorMessage = `HTTP ${status}: ${response.statusText}`;

		try {
			const errorData = await response.json();
			errorMessage = errorData.error?.message || errorMessage;
		} catch {
			// Ignore JSON parse errors
		}

		let errorType: OpenRouterErrorType;

		switch (status) {
			case 401:
			case 403:
				errorType = OpenRouterErrorType.AUTHENTICATION;
				break;
			case 429:
				errorType = OpenRouterErrorType.RATE_LIMIT;
				break;
			case 503:
				errorType = OpenRouterErrorType.MODEL_OVERLOADED;
				break;
			case 400:
				errorType = OpenRouterErrorType.INVALID_PROMPT;
				break;
			default:
				errorType = OpenRouterErrorType.SERVER_ERROR;
		}

		return new OpenRouterError(errorMessage, errorType, status);
	}
}
