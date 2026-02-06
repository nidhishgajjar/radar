import type { SearchResult } from '$lib/types/exa';

interface CompanyUrlEntry {
	name: string;
	linkedinUrl: string;
}

/**
 * Normalize a LinkedIn company URL for deduplication.
 * Strips trailing slashes, www prefix, ensures https.
 */
export function normalizeLinkedInUrl(url: string): string {
	return url
		.replace(/^http:/, 'https:')
		.replace(/\/+$/, '')
		.replace('://www.', '://');
}

/**
 * Extract all unique LinkedIn company URLs from person result text fields.
 * Scans for markdown links like: [Stripe](https://www.linkedin.com/company/stripe)
 *
 * Returns a Map of normalizedUrl -> { name, linkedinUrl }
 */
export function extractCompanyLinkedInUrls(
	results: SearchResult[]
): Map<string, CompanyUrlEntry> {
	const companyMap = new Map<string, CompanyUrlEntry>();
	const regex = /\[([^\]]+)\]\((https:\/\/(?:www\.)?linkedin\.com\/company\/[^\s)]+)\)/g;

	for (const result of results) {
		if (!result.text) continue;

		let match: RegExpExecArray | null;
		while ((match = regex.exec(result.text)) !== null) {
			const name = match[1].trim();
			const rawUrl = match[2];
			const normalized = normalizeLinkedInUrl(rawUrl);

			if (!companyMap.has(normalized)) {
				companyMap.set(normalized, { name, linkedinUrl: rawUrl });
			}
		}
	}

	return companyMap;
}

/**
 * Get the LinkedIn company URL for a person's current employer.
 * Looks for the first company URL appearing in the "Current" / most recent
 * experience section of the text.
 */
export function getCurrentCompanyUrl(result: SearchResult): CompanyUrlEntry | null {
	if (!result.text) return null;

	const regex = /\[([^\]]+)\]\((https:\/\/(?:www\.)?linkedin\.com\/company\/[^\s)]+)\)/g;

	// The text typically lists experience chronologically with the current role first.
	// We return the first company LinkedIn URL found.
	const match = regex.exec(result.text);
	if (match) {
		return {
			name: match[1].trim(),
			linkedinUrl: match[2]
		};
	}

	return null;
}
