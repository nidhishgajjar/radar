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

export class OpenRouterClient {
	private apiKey: string;
	private model: string;
	private timeout: number;
	private baseUrl = 'https://openrouter.ai/api/v1';

	constructor() {
		if (!OPENROUTER_API_KEY) {
			throw new Error('OPENROUTER_API_KEY is not configured');
		}
		this.apiKey = OPENROUTER_API_KEY;
		this.model = OPENROUTER_MODEL || 'x-ai/grok-4.1-fast';
		this.timeout = parseInt(OPENROUTER_TIMEOUT_MS || '5000');
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

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.timeout);

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

			const data: OpenRouterResponse = await response.json();

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
		} catch (error) {
			if (error instanceof OpenRouterError) {
				throw error;
			}

			if (error instanceof Error) {
				if (error.name === 'AbortError') {
					throw new OpenRouterError(
						'Request timeout',
						OpenRouterErrorType.TIMEOUT
					);
				}
				throw new OpenRouterError(
					`Network error: ${error.message}`,
					OpenRouterErrorType.NETWORK
				);
			}

			throw new OpenRouterError(
				'Unknown error occurred',
				OpenRouterErrorType.SERVER_ERROR
			);
		}
	}

	/**
	 * Fast local query generation - no LLM needed for simple searches.
	 * Returns null if the query is too complex and needs LLM.
	 */
	private generateQueriesLocally(
		query: string,
		location: string | null,
		flexibleLocation: boolean
	): string[] | null {
		// Extract potential job title from query
		const titlePatterns = [
			/\b(senior|lead|principal|staff|junior|mid|entry)\s+(software|frontend|backend|fullstack|full-stack|mobile|ios|android|devops|cloud|data|ml|machine learning|ai|product|ux|ui)\s*(engineer|developer|designer|manager|analyst|scientist|architect)/gi,
			/\b(software|frontend|backend|fullstack|full-stack|mobile|devops|cloud|data|product)\s*(engineer|developer|designer|manager|analyst|architect)/gi,
			/\b(cto|ceo|cfo|coo|vp|director|head|manager|lead)\s*(of)?\s*(engineering|product|design|marketing|sales|operations|finance|hr|people)?/gi,
			/\b(nurse|doctor|physician|surgeon|therapist|pharmacist|technician|administrator)/gi
		];

		let baseTitle: string | null = null;
		for (const pattern of titlePatterns) {
			const match = query.match(pattern);
			if (match) {
				baseTitle = match[0];
				break;
			}
		}

		// If no clear job title found, can't generate locally
		if (!baseTitle) {
			return null;
		}

		// Generate title variations
		const seniorityLevels = ['Senior', 'Lead', 'Principal', 'Staff'];
		const baseTitleClean = baseTitle.replace(/^(senior|lead|principal|staff|junior|mid|entry)\s+/i, '');

		const queries: string[] = [];
		const locationSuffix = location && !flexibleLocation ? ` ${location}` : '';

		// Add variations with different seniority levels
		for (const level of seniorityLevels) {
			queries.push(`"${level} ${baseTitleClean}"${locationSuffix}`);
		}

		// Add the original query as well
		if (!queries.some(q => q.toLowerCase().includes(baseTitle!.toLowerCase()))) {
			queries.unshift(`"${baseTitle}"${locationSuffix}`);
		}

		return queries.slice(0, 4); // Limit to 4 queries
	}

	async generateRecruitmentQueries(
		jobDescription: string,
		excludeEmployer?: string,
		geographicFocus?: string[],
		flexibleLocation: boolean = false
	): Promise<string[]> {
		// Extract location from job description for strict filtering
		const locationMatch = jobDescription.match(/\b(Toronto|Vancouver|Calgary|Edmonton|Ottawa|Montreal|Winnipeg|Halifax|Victoria|BC|Ontario|Alberta|Quebec|Canada|USA|New York|San Francisco|Seattle|Boston|Chicago|Los Angeles|Austin|Denver|Miami|Atlanta)\b/gi);
		const detectedLocation = locationMatch ? [...new Set(locationMatch)].join(', ') : null;

		// Try fast local generation first (for simple queries)
		if (jobDescription.length < 150 && !excludeEmployer) {
			const localQueries = this.generateQueriesLocally(jobDescription, detectedLocation, flexibleLocation);
			if (localQueries && localQueries.length >= 2) {
				console.log('Using fast local query generation');
				return localQueries;
			}
		}

		// Fall back to LLM for complex queries - use a faster model
		const fastModel = 'google/gemini-2.0-flash-001';

		const locationSuffix = detectedLocation && !flexibleLocation ? ` in ${detectedLocation}` : '';
		const systemPrompt = `Generate 4 LinkedIn search queries for: ${jobDescription}${locationSuffix}
${excludeEmployer ? `Exclude: ${excludeEmployer}` : ''}
Return ONLY a JSON array of 4 search strings. Use title variations (Senior, Lead, Principal, Staff).`;

		const request: OpenRouterRequest = {
			model: fastModel,
			messages: [
				{ role: 'user', content: systemPrompt }
			],
			temperature: 0.2,
			max_tokens: 150
		};

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

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

			const data: OpenRouterResponse = await response.json();

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
			// Fallback to local generation or original query
			const fallback = this.generateQueriesLocally(jobDescription, detectedLocation, flexibleLocation);
			return fallback || [jobDescription];
		}
	}

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
	}> {
		const systemPrompt = `You are screening a LinkedIn profile for executive recruitment.

Job: ${jobDescription}
${excludeEmployer ? `Exclude current employees of: ${excludeEmployer}` : ''}
${minYearsExperience ? `Minimum experience: ${minYearsExperience} years` : ''}

Analyze this LinkedIn profile and return JSON with:
{
  "currentEmployer": "Company name or null",
  "isExternal": true/false (false if currently at ${excludeEmployer}),
  "fitScore": 0-100,
  "reasoning": "Brief explanation",
  "recentlyLeft": true/false (if left within 6 months)
}

DISQUALIFY (fitScore 0) if:
- Currently works at ${excludeEmployer}
- Less than ${minYearsExperience || 10} years total experience
- No relevant healthcare/cancer care leadership

SCORING:
- 80-100: Excellent fit - strong cancer care + senior leadership + external
- 60-79: Good fit - relevant healthcare leadership + external
- 40-59: Moderate fit - some relevant experience
- 0-39: Poor fit - insufficient experience or current employee

Return ONLY valid JSON.`;

		const request: OpenRouterRequest = {
			model: this.model,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: profile }
			],
			temperature: 0.2,
			max_tokens: 150
		};

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.timeout);

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

			const data: OpenRouterResponse = await response.json();

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
					recentlyLeft: false
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
				recentlyLeft: false
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

		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), this.timeout);

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

			const data: OpenRouterResponse = await response.json();

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
		} catch (error) {
			if (error instanceof OpenRouterError) {
				throw error;
			}

			if (error instanceof Error) {
				if (error.name === 'AbortError') {
					throw new OpenRouterError(
						'Request timeout',
						OpenRouterErrorType.TIMEOUT
					);
				}
				throw new OpenRouterError(
					`Network error: ${error.message}`,
					OpenRouterErrorType.NETWORK
				);
			}

			throw new OpenRouterError(
				'Unknown error occurred',
				OpenRouterErrorType.SERVER_ERROR
			);
		}
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
