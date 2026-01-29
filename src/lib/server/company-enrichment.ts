/**
 * Company Enrichment Service
 * Searches data provider sites and news for company data and real-time signals
 * Extracts headcount, revenue, funding, layoffs, acquisitions, and more
 */

import Exa from 'exa-js';
import { EXA_API_KEY } from '$env/static/private';

export interface CompanySignals {
	recentFunding?: {
		amount: string;
		round?: string;
		date?: string;
	};
	recentLayoffs?: {
		count?: number;
		percentage?: string;
		date?: string;
	};
	hiringSpree?: {
		roles?: string;
		date?: string;
	};
	acquisition?: {
		acquirer?: string;
		acquired?: string;
		date?: string;
	};
	leadershipChange?: {
		role: string;
		name?: string;
		type: 'joined' | 'left' | 'promoted';
		date?: string;
	};
}

export interface CompanyData {
	name: string;
	linkedinUrl?: string;
	website?: string;
	headcount?: number;
	headcountRange?: string;
	headcountGrowth?: string;
	revenue?: string;
	revenueAmount?: number;
	funding?: string;
	fundingTotal?: string;
	fundingRound?: string;
	industry?: string;
	location?: string;
	founded?: string;
	description?: string;
	sourceUrl?: string;
	// Real-time signals
	signals?: CompanySignals;
}

export interface EnrichmentStats {
	companiesSearched: number;
	companiesFound: number;
	searchesPerformed: number;
	cacheHits: number;
	estimatedCost: number;
	durationMs: number;
	signalsFound: number;
}

// In-memory cache for company data (persists across requests)
const companyCache = new Map<string, CompanyData>();

// Data provider sites to search
const DATA_PROVIDER_DOMAINS = [
	'zoominfo.com',
	'rocketreach.co',
	'leadiq.com',
	'apollo.io',
	'crunchbase.com',
	'pitchbook.com',
	'cbinsights.com'
];

// News sites for real-time signals
const NEWS_DOMAINS = [
	'techcrunch.com',
	'reuters.com',
	'bloomberg.com',
	'businessinsider.com',
	'forbes.com',
	'cnbc.com',
	'theinformation.com',
	'prnewswire.com',
	'businesswire.com'
];

// Cost tracking
const COST_PER_SEARCH = 0.005; // $5 per 1000 searches (Exa pricing for <25 results)

// Rate limiting - Exa allows 5 requests per second
const RATE_LIMIT_BATCH_SIZE = 5;
const RATE_LIMIT_DELAY_MS = 1100; // Slightly over 1 second for safety

/**
 * Sleep helper for rate limiting
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

export class CompanyEnrichmentService {
	private exa: Exa;

	constructor() {
		this.exa = new Exa(EXA_API_KEY);
	}

	/**
	 * Normalize company name for cache key
	 */
	private normalizeCompanyName(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9]/g, '')
			.trim();
	}

	/**
	 * Extract company data from text
	 */
	private extractCompanyData(text: string, url: string, companyName: string): CompanyData {
		const data: CompanyData = {
			name: companyName,
			sourceUrl: url
		};

		// Extract headcount - multiple patterns
		const headcountPatterns = [
			/(\d{1,3}(?:,\d{3})*)\s*employees/i,
			/(\d{1,3}(?:,\d{3})*)\s*people/i,
			/(\d{1,3}(?:,\d{3})*)\s*staff/i,
			/headcount[:\s]*(\d{1,3}(?:,\d{3})*)/i,
			/company size[:\s]*(\d{1,3}(?:,\d{3})*)/i,
			/team of\s*(\d{1,3}(?:,\d{3})*)/i,
			/(\d+)\s*-\s*(\d+)\s*employees/i,
			/(\d{1,3}(?:,\d{3})*)\s*(?:full[- ]?time|FTE)/i
		];

		for (const pattern of headcountPatterns) {
			const match = text.match(pattern);
			if (match) {
				if (match[2]) {
					data.headcountRange = `${match[1]}-${match[2]}`;
					data.headcount = parseInt(match[2].replace(/,/g, ''));
				} else {
					data.headcount = parseInt(match[1].replace(/,/g, ''));
				}
				break;
			}
		}

		// Extract headcount growth
		const growthMatch = text.match(/employees?\s*\(([+-]?\d+(?:\.\d+)?%)\s*(?:YoY|growth|change)\)/i) ||
			text.match(/([+-]?\d+(?:\.\d+)?%)\s*(?:headcount|employee|workforce)\s*(?:growth|change)/i);
		if (growthMatch) {
			data.headcountGrowth = growthMatch[1];
		}

		// Extract revenue - improved patterns
		const revenuePatterns = [
			// "$X million revenue" or "revenue: $X million"
			/revenue[:\s]*\$?([\d,.]+)\s*(billion|million|B|M|bn|mn|b|m)/i,
			/\$?([\d,.]+)\s*(billion|million|B|M|bn|mn|b|m)\s*(?:in\s*)?(?:revenue|ARR|annual|sales)/i,
			// "revenue of $X"
			/revenue\s*(?:of|:)?\s*\$?([\d,.]+)\s*(billion|million|B|M|bn|mn|b|m)?/i,
			// Standalone with context
			/\$?([\d,.]+)\s*(billion|million|B|M|bn|mn|b|m)\s*ARR/i,
			// Format: "$48.3 million"
			/\$([\d,.]+)\s*(billion|million|B|M|bn|mn|b|m)/i
		];

		for (const pattern of revenuePatterns) {
			const match = text.match(pattern);
			if (match) {
				const amount = parseFloat(match[1].replace(/,/g, ''));
				const unit = (match[2] || '').toLowerCase();

				if (unit.includes('b') || unit.includes('billion') || unit.includes('bn')) {
					data.revenueAmount = amount * 1000000000;
					data.revenue = `$${amount}B`;
				} else if (unit.includes('m') || unit.includes('million') || unit.includes('mn') || amount >= 1) {
					data.revenueAmount = amount * 1000000;
					data.revenue = `$${amount}M`;
				}
				if (data.revenue) break;
			}
		}

		// Extract funding - comprehensive patterns
		const fundingPatterns = [
			// "raised $X million in Series B"
			/raised\s*\$?([\d,.]+)\s*(billion|million|B|M|bn|mn|b|m)(?:\s*in\s*(Series\s*[A-Z]|Seed|Pre-Seed|Bridge))?/i,
			// "Series B of $X million"
			/(Series\s*[A-Z]|Seed|Pre-Seed)\s*(?:funding|round)?\s*(?:of)?\s*\$?([\d,.]+)\s*(billion|million|B|M|bn|mn|b|m)/i,
			// "$X million Series B"
			/\$?([\d,.]+)\s*(billion|million|B|M|bn|mn|b|m)\s*(Series\s*[A-Z]|Seed|Pre-Seed)/i,
			// "funding: $X million"
			/(?:total\s*)?funding[:\s]*\$?([\d,.]+)\s*(billion|million|B|M|bn|mn|b|m)/i,
			// Just "Series X" mention
			/(Series\s*[A-Z]|Seed|Pre-Seed)\s*(?:funding|round|stage)/i
		];

		for (const pattern of fundingPatterns) {
			const match = text.match(pattern);
			if (match) {
				// Determine which capture group has what
				let amount: string | undefined;
				let unit: string | undefined;
				let round: string | undefined;

				for (const group of match.slice(1)) {
					if (!group) continue;
					if (/series|seed|pre-seed|bridge/i.test(group)) {
						round = group;
					} else if (/billion|million|[BMbm]|bn|mn/i.test(group)) {
						unit = group;
					} else if (/[\d,.]+/.test(group)) {
						amount = group;
					}
				}

				if (round) {
					data.fundingRound = round;
				}
				if (amount && unit) {
					const num = parseFloat(amount.replace(/,/g, ''));
					const u = unit.toLowerCase();
					if (u.includes('b') || u.includes('billion') || u.includes('bn')) {
						data.funding = `$${num}B`;
						data.fundingTotal = `$${num}B`;
					} else {
						data.funding = `$${num}M`;
						data.fundingTotal = `$${num}M`;
					}
				} else if (round && !data.funding) {
					data.funding = round;
				}
				break;
			}
		}

		// Extract industry
		const industryPatterns = [
			/industry[:\s]*([A-Za-z &\/\-]+?)(?:\s*·|\s*\||\s*,|\n|$)/i,
			/([A-Za-z &\/\-]+)\s*·\s*[\d,]+\s*employees/i,
			/sector[:\s]*([A-Za-z &\/\-]+?)(?:\s*·|\s*\||\n|$)/i
		];

		for (const pattern of industryPatterns) {
			const match = text.match(pattern);
			if (match && match[1].length < 40) {
				data.industry = match[1].trim();
				break;
			}
		}

		// Extract location
		const locationPatterns = [
			/(?:headquarters|headquartered|location|based in|hq)[:\s]*([A-Za-z\s,]+?)(?:\s*·|\s*\||\n|$)/i,
			/employees[^·]*·\s*([A-Za-z\s,]+?)(?:\s*·|\s*Founded|$)/i,
			/([A-Za-z]+,\s*[A-Za-z]+)\s*·\s*Founded/i
		];

		for (const pattern of locationPatterns) {
			const match = text.match(pattern);
			if (match && match[1].length < 50 && match[1].length > 3) {
				data.location = match[1].trim();
				break;
			}
		}

		// Extract founded year
		const foundedMatch = text.match(/founded[:\s]*(\d{4})/i) ||
			text.match(/·\s*Founded\s*(\d{4})/i) ||
			text.match(/since\s*(\d{4})/i);
		if (foundedMatch) {
			data.founded = foundedMatch[1];
		}

		// Extract website
		const websiteMatch = text.match(/(?:website|url|site)[:\s]*(https?:\/\/[^\s]+)/i) ||
			text.match(/(https?:\/\/(?:www\.)?[a-z0-9-]+\.[a-z]{2,})/i);
		if (websiteMatch) {
			data.website = websiteMatch[1];
		}

		// Extract description (first meaningful paragraph)
		const lines = text.split('\n').filter(l => l.trim().length > 50 && !l.includes('cookie') && !l.includes('sign in'));
		if (lines.length > 0) {
			data.description = lines[0].substring(0, 200);
		}

		return data;
	}

	/**
	 * Extract real-time signals from news articles
	 */
	private extractSignals(text: string, companyName: string): CompanySignals {
		const signals: CompanySignals = {};

		// Layoffs detection
		const layoffPatterns = [
			/(?:laid off|laying off|layoffs?|cut|cutting|eliminated?)\s*(?:about\s*)?(\d{1,3}(?:,\d{3})*)\s*(?:employees?|workers?|jobs?|staff|people)/i,
			/(\d{1,3}(?:,\d{3})*)\s*(?:employees?|workers?|jobs?)\s*(?:laid off|cut|eliminated)/i,
			/(?:reducing|reduce)\s*(?:workforce|headcount|staff)\s*by\s*(\d+)%/i,
			/(\d+)%\s*(?:of\s*)?(?:workforce|staff|employees?)\s*(?:cut|laid off|let go)/i
		];

		for (const pattern of layoffPatterns) {
			const match = text.match(pattern);
			if (match) {
				signals.recentLayoffs = {
					count: match[1].includes('%') ? undefined : parseInt(match[1].replace(/,/g, '')),
					percentage: match[1].includes('%') ? match[1] : undefined
				};
				break;
			}
		}

		// Hiring spree detection
		const hiringPatterns = [
			/(?:hiring|plans? to hire|looking to hire|recruiting)\s*(\d{1,3}(?:,\d{3})*)\s*(?:new\s*)?(?:employees?|workers?|people)/i,
			/(?:expanding|growing)\s*team\s*by\s*(\d{1,3}(?:,\d{3})*)/i,
			/(\d{1,3}(?:,\d{3})*)\s*(?:new\s*)?(?:positions?|roles?|openings?)/i
		];

		for (const pattern of hiringPatterns) {
			const match = text.match(pattern);
			if (match) {
				signals.hiringSpree = {
					roles: `${match[1]} positions`
				};
				break;
			}
		}

		// Acquisition detection
		const acquisitionPatterns = [
			/(?:acquired|acquires|buying|bought|purchasing)\s+([A-Z][A-Za-z\s]+?)(?:\s+for|\s+in|\s*,)/i,
			/([A-Z][A-Za-z\s]+?)\s+(?:acquired|bought)\s+by\s+([A-Z][A-Za-z\s]+)/i,
			/acquisition\s+of\s+([A-Z][A-Za-z\s]+)/i
		];

		for (const pattern of acquisitionPatterns) {
			const match = text.match(pattern);
			if (match) {
				signals.acquisition = {
					acquired: match[1]?.trim(),
					acquirer: match[2]?.trim()
				};
				break;
			}
		}

		// Leadership change detection
		const leadershipPatterns = [
			/(?:new|appoints?|names?|hires?)\s+(CEO|CTO|CFO|COO|CMO|CPO|President|Chief\s+\w+\s+Officer)/i,
			/(CEO|CTO|CFO|COO|CMO|CPO|President)\s+(?:steps? down|leaves?|departs?|resigns?|exits?)/i,
			/([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:joins?|appointed|named)\s+(?:as\s+)?(CEO|CTO|CFO|COO|CMO|President)/i
		];

		for (const pattern of leadershipPatterns) {
			const match = text.match(pattern);
			if (match) {
				const lowerText = match[0].toLowerCase();
				signals.leadershipChange = {
					role: match[1] || match[2],
					name: match[0].match(/([A-Z][a-z]+\s+[A-Z][a-z]+)/)?.[1],
					type: lowerText.includes('leaves') || lowerText.includes('depart') || lowerText.includes('resign') || lowerText.includes('exit') || lowerText.includes('step')
						? 'left'
						: lowerText.includes('promot')
							? 'promoted'
							: 'joined'
				};
				break;
			}
		}

		// Recent funding from news
		const fundingNewsPatterns = [
			/(?:raises?|raised|secures?|secured|closes?|closed)\s*\$?([\d,.]+)\s*(billion|million|B|M)\s*(?:in\s*)?(Series\s*[A-Z]|Seed|funding|round)?/i
		];

		for (const pattern of fundingNewsPatterns) {
			const match = text.match(pattern);
			if (match) {
				const amount = parseFloat(match[1].replace(/,/g, ''));
				const unit = match[2].toLowerCase();
				signals.recentFunding = {
					amount: unit.includes('b') ? `$${amount}B` : `$${amount}M`,
					round: match[3]
				};
				break;
			}
		}

		return signals;
	}

	/**
	 * Search for company news and signals
	 */
	async searchCompanyNews(companyName: string): Promise<{ signals: CompanySignals; searchCount: number }> {
		try {
			const result = await this.exa.search(`"${companyName}" funding OR layoffs OR acquisition OR hiring OR CEO`, {
				numResults: 5,
				type: 'auto',
				includeDomains: NEWS_DOMAINS,
				contents: { text: true }
			});

			const allSignals: CompanySignals = {};

			for (const r of result.results) {
				const text = r.text || '';
				const signals = this.extractSignals(text, companyName);

				// Merge signals (first found wins)
				if (signals.recentFunding && !allSignals.recentFunding) {
					allSignals.recentFunding = signals.recentFunding;
				}
				if (signals.recentLayoffs && !allSignals.recentLayoffs) {
					allSignals.recentLayoffs = signals.recentLayoffs;
				}
				if (signals.hiringSpree && !allSignals.hiringSpree) {
					allSignals.hiringSpree = signals.hiringSpree;
				}
				if (signals.acquisition && !allSignals.acquisition) {
					allSignals.acquisition = signals.acquisition;
				}
				if (signals.leadershipChange && !allSignals.leadershipChange) {
					allSignals.leadershipChange = signals.leadershipChange;
				}
			}

			return { signals: allSignals, searchCount: 1 };
		} catch (error) {
			console.error(`[Enrichment] Error searching news for ${companyName}:`, error);
			return { signals: {}, searchCount: 1 };
		}
	}

	/**
	 * Search for company data on data provider sites
	 */
	async enrichCompany(companyName: string, includeNews: boolean = false): Promise<{ data: CompanyData | null; searchCount: number; cached: boolean }> {
		const cacheKey = this.normalizeCompanyName(companyName);

		// Check cache first
		if (companyCache.has(cacheKey)) {
			return { data: companyCache.get(cacheKey)!, searchCount: 0, cached: true };
		}

		// Skip very short or generic names
		if (companyName.length < 3 || ['inc', 'llc', 'corp', 'company'].includes(cacheKey)) {
			return { data: null, searchCount: 0, cached: false };
		}

		let searchCount = 0;

		try {
			// Search data providers
			const result = await this.exa.search(`"${companyName}" company employees revenue`, {
				numResults: 5,
				type: 'auto',
				includeDomains: DATA_PROVIDER_DOMAINS,
				contents: { text: true }
			});
			searchCount++;

			let data: CompanyData | null = null;

			// Find best result from data provider sites
			for (const r of result.results) {
				const text = r.text || '';
				if (text.length > 100) {
					data = this.extractCompanyData(text, r.url, companyName);

					// If we found useful data, stop searching
					if (data.headcount || data.revenue || data.funding) {
						break;
					}
				}
			}

			if (!data) {
				data = { name: companyName };
			}

			// Optionally search for news signals
			if (includeNews && (data.headcount || data.revenue)) {
				const { signals, searchCount: newsSearches } = await this.searchCompanyNews(companyName);
				searchCount += newsSearches;
				if (Object.keys(signals).length > 0) {
					data.signals = signals;
				}
			}

			// Cache result
			if (data.headcount || data.revenue || data.funding) {
				companyCache.set(cacheKey, data);
				return { data, searchCount, cached: false };
			}

			// Cache null result to avoid re-searching
			companyCache.set(cacheKey, { name: companyName });
			return { data: null, searchCount, cached: false };
		} catch (error) {
			console.error(`[Enrichment] Error searching for ${companyName}:`, error);
			return { data: null, searchCount, cached: false };
		}
	}

	/**
	 * Enrich multiple companies in parallel with deduplication
	 */
	async enrichCompanies(
		companyNames: string[],
		options: { includeNews?: boolean } = {},
		onProgress?: (stats: { completed: number; total: number }) => void
	): Promise<{ results: Map<string, CompanyData>; stats: EnrichmentStats }> {
		const startTime = Date.now();
		const results = new Map<string, CompanyData>();
		const { includeNews = false } = options;

		// Deduplicate company names
		const uniqueCompanies = [...new Set(
			companyNames
				.filter(name => name && name.length > 2)
				.map(name => name.trim())
		)];

		let searchCount = 0;
		let cacheHits = 0;
		let found = 0;
		let signalsFound = 0;

		// Process in rate-limited batches (Exa allows 5 requests/second)
		console.log(`[Enrichment] Starting rate-limited enrichment for ${uniqueCompanies.length} companies (${RATE_LIMIT_BATCH_SIZE}/sec)...`);

		const allResults: Array<{ name: string; data: CompanyData | null; searches: number; cached: boolean; index: number }> = [];

		// Process in batches with rate limiting
		for (let i = 0; i < uniqueCompanies.length; i += RATE_LIMIT_BATCH_SIZE) {
			const batch = uniqueCompanies.slice(i, i + RATE_LIMIT_BATCH_SIZE);
			const batchPromises = batch.map(async (name, batchIndex) => {
				const { data, searchCount: searches, cached } = await this.enrichCompany(name, includeNews);
				return { name, data, searches, cached, index: i + batchIndex };
			});

			const batchResults = await Promise.all(batchPromises);
			allResults.push(...batchResults);

			// Report progress
			if (onProgress) {
				onProgress({ completed: allResults.length, total: uniqueCompanies.length });
			}

			// Rate limit: wait before next batch (unless this is the last batch)
			if (i + RATE_LIMIT_BATCH_SIZE < uniqueCompanies.length) {
				await sleep(RATE_LIMIT_DELAY_MS);
			}
		}

		// Process results
		for (const { name, data, searches, cached } of allResults) {
			searchCount += searches;
			if (cached) cacheHits++;
			if (data && (data.headcount || data.revenue)) {
				found++;
				if (data.signals && Object.keys(data.signals).length > 0) {
					signalsFound++;
				}
				results.set(this.normalizeCompanyName(name), data);
			}
		}

		const stats: EnrichmentStats = {
			companiesSearched: uniqueCompanies.length,
			companiesFound: found,
			searchesPerformed: searchCount,
			cacheHits,
			estimatedCost: searchCount * COST_PER_SEARCH,
			durationMs: Date.now() - startTime,
			signalsFound
		};

		console.log(`[Enrichment] Complete: ${found}/${uniqueCompanies.length} companies, ${signalsFound} with signals, ${searchCount} searches ($${stats.estimatedCost.toFixed(3)}), ${cacheHits} cache hits, ${stats.durationMs}ms`);

		return { results, stats };
	}

	/**
	 * Get company data for a result by matching company name
	 */
	getCompanyData(companyName: string): CompanyData | null {
		const cacheKey = this.normalizeCompanyName(companyName);
		return companyCache.get(cacheKey) || null;
	}

	/**
	 * Clear the cache (for testing)
	 */
	clearCache(): void {
		companyCache.clear();
	}

	/**
	 * Get cache stats
	 */
	getCacheStats(): { size: number; companies: string[] } {
		return {
			size: companyCache.size,
			companies: Array.from(companyCache.keys())
		};
	}
}

// Singleton instance
export const companyEnrichment = new CompanyEnrichmentService();
