import type { SearchResult, CompanyPageData } from '$lib/types/exa';

/**
 * Normalize a company name for deduplication/cache key.
 */
export function normalizeCompanyName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

/**
 * Extract current company data from a person's profile text.
 * Exa person text uses format:
 *   ### Role at [CompanyName]<web_link> (Current)
 *   Company: 501-1000 employees • Founded 2011 • Privately Held • Software Development
 */
export function extractCurrentCompanyData(result: SearchResult): CompanyPageData | null {
	if (!result.text) return null;

	// Find the current position: "### ... at [CompanyName]<web_link> (Current)"
	const currentMatch = result.text.match(
		/###\s+.+?\s+at\s+\[([^\]]+)\](?:<[^>]*>)?\s*\(Current\)/
	);
	if (!currentMatch) return null;

	const companyName = currentMatch[0] ? currentMatch[1].trim() : null;
	if (!companyName) return null;

	// Find the company metadata line that follows the current position
	// Pattern: "Company: X employees • Founded YYYY • Type • Industry"
	const currentIdx = result.text.indexOf(currentMatch[0]);
	const textAfter = result.text.substring(currentIdx, currentIdx + 500);

	const data: CompanyPageData = {
		name: companyName,
		linkedinUrl: `https://linkedin.com/company/${companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
	};

	// Extract company metadata line
	const metaMatch = textAfter.match(
		/Company:\s*(.+?)(?:\n|$)/
	);
	if (metaMatch) {
		const metaLine = metaMatch[1];

		// Headcount: "501-1000 employees", "1001-5000 employees", "10,001+ employees"
		const headcountMatch = metaLine.match(/([\d,]+(?:\+)?(?:\s*-\s*[\d,]+)?)\s*employees/i);
		if (headcountMatch) {
			data.headcountRange = headcountMatch[1] + ' employees';
			const raw = headcountMatch[1].replace(/,/g, '');
			// For ranges like "501-1000", use upper bound; for "10001+", use the number
			const parts = raw.split('-');
			data.headcount = parseInt(parts[parts.length - 1].replace('+', ''));
		}

		// Founded year
		const foundedMatch = metaLine.match(/Founded\s+(\d{4})/);
		if (foundedMatch) {
			data.founded = foundedMatch[1];
		}

		// Industry (last segment after bullets)
		const segments = metaLine.split('•').map(s => s.trim());
		// Industry is typically the last segment (e.g., "Software Development", "Financial Services")
		if (segments.length >= 2) {
			const lastSeg = segments[segments.length - 1];
			if (lastSeg.length > 2 && lastSeg.length < 50 && !lastSeg.includes('employees')) {
				data.industry = lastSeg;
			}
		}
	}

	// Extract location from the lines after the current position
	const locationMatch = textAfter.match(/\n\n([A-Z][A-Za-z\s]+,\s*[A-Za-z\s]+(?:,\s*[A-Za-z\s]+)?)\s*(?:\(|$|\n)/);
	if (locationMatch) {
		data.headquarters = locationMatch[1].trim();
	}

	// Extract description from About section if it exists
	const aboutMatch = result.text.match(/## About\n\n(.+?)(?:\n\n|$)/s);
	if (aboutMatch) {
		// Use the about text but truncate - it's the person's about, not company
		// We'll use it as context anyway
	}

	// Build rawSnippet for LLM context
	const snippetParts = [data.name];
	if (data.industry) snippetParts.push(data.industry);
	if (data.headcount) snippetParts.push(`${data.headcount} employees`);
	if (data.headquarters) snippetParts.push(data.headquarters);
	if (data.founded) snippetParts.push(`Founded ${data.founded}`);
	data.rawSnippet = snippetParts.join(' | ');

	return data;
}

/**
 * Extract unique company data from all person results.
 * Returns a Map of normalizedCompanyName -> CompanyPageData
 */
export function extractCompanyDataFromResults(
	results: SearchResult[]
): Map<string, CompanyPageData> {
	const companyMap = new Map<string, CompanyPageData>();

	for (const result of results) {
		const companyData = extractCurrentCompanyData(result);
		if (companyData) {
			const key = normalizeCompanyName(companyData.name);
			// Keep the richest entry (most fields populated)
			const existing = companyMap.get(key);
			if (!existing || countFields(companyData) > countFields(existing)) {
				companyMap.set(key, companyData);
			}
		}
	}

	return companyMap;
}

function countFields(data: CompanyPageData): number {
	let count = 0;
	if (data.industry) count++;
	if (data.headcount) count++;
	if (data.headquarters) count++;
	if (data.founded) count++;
	if (data.description) count++;
	return count;
}
