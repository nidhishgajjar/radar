/**
 * Exa People Search API Types
 * Based on official SDK and API documentation
 */

export interface SearchOptions {
	/** Search query string */
	query: string;

	/** Number of results to return (1-100) */
	numResults?: number;

	/** Search type: auto, neural, or keyword */
	type?: 'auto' | 'neural' | 'keyword';

	/** Category filter - use 'people' for people search */
	category?: 'people' | 'company' | 'research paper' | 'news' | 'pdf' | 'github' | 'tweet';

	/** Include full text content */
	text?: boolean;

	/** Include highlights */
	highlights?: boolean;

	/** Page number for pagination (starts at 1) */
	page?: number;
}

export interface SearchFilters {
	/** Exclude current employer */
	excludeCurrentEmployer?: string;

	/** Only show external candidates */
	externalOnly: boolean;

	/** Geographic focus areas */
	geographicFocus?: string[];

	/** Include people who recently left roles (within 6 months) */
	includeRecentDepartures: boolean;

	/** Minimum years of experience */
	minYearsExperience?: number;

	/** Allow flexible location matching (default: false = strict) */
	flexibleLocation?: boolean;
}

// Entity types from Exa people search
export interface EntityCompanyRef {
	id?: string | null;
	name?: string | null;
}

export interface WorkHistoryEntry {
	title?: string | null;
	location?: string | null;
	dates?: { from?: string | null; to?: string | null } | null;
	company?: EntityCompanyRef | null;
}

export interface PersonEntity {
	id: string;
	type: 'person';
	version: number;
	properties: {
		name?: string | null;
		location?: string | null;
		workHistory?: WorkHistoryEntry[];
	};
}

// Company data from LinkedIn page enrichment
export interface CompanyPageData {
	name: string;
	linkedinUrl: string;
	description?: string;
	industry?: string;
	headcount?: number;
	headquarters?: string;
	founded?: string;
	specialties?: string[];
	website?: string;
	rawSnippet?: string;
}

export interface SearchResult {
	/** Result ID */
	id: string;

	/** Page title */
	title: string;

	/** URL */
	url: string;

	/** Relevance score */
	score: number;

	/** Published date (ISO 8601) */
	publishedDate?: string;

	/** Author */
	author?: string;

	/** Full text content (if requested) */
	text?: string;

	/** Highlights (if requested) */
	highlights?: string[];

	/** Highlight scores */
	highlightScores?: number[];

	/** Summary (if requested) */
	summary?: string;

	/** Image URL */
	image?: string;

	/** Exa entity data (people search) */
	entities?: PersonEntity[];

	/** Enriched company data from LinkedIn page */
	companyData?: CompanyPageData;

	/** Filtering metadata (added by post-processing) */
	filterMetadata?: {
		currentEmployer?: string;
		isExternal: boolean;
		fitScore: number;
		reasoning: string;
		recentlyLeft?: boolean;
		qualified?: boolean;
		matchingFactors?: string[];
		keyHighlights?: string[];
	};
}

export interface SearchResponse {
	/** Request ID for debugging */
	requestId: string;

	/** Search results */
	results: SearchResult[];

	/** Search type used */
	searchType: string;

	/** Cursor for pagination - pass to next request to get more results */
	nextCursor?: string;
}

export enum ExaErrorType {
	AUTHENTICATION = 'AUTHENTICATION',
	RATE_LIMIT = 'RATE_LIMIT',
	TIMEOUT = 'TIMEOUT',
	NETWORK = 'NETWORK',
	INVALID_REQUEST = 'INVALID_REQUEST',
	SERVER_ERROR = 'SERVER_ERROR'
}

export class ExaError extends Error {
	constructor(
		public type: ExaErrorType,
		public statusCode?: number,
		message?: string
	) {
		super(message);
		this.name = 'ExaError';
	}
}
