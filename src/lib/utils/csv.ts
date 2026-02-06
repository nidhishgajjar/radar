import type { SearchResult } from '$lib/types/exa';

export interface ParsedPerson {
	name: string;
	title: string;
	company: string;
}

/**
 * Parse person details from LinkedIn title format
 * Common formats:
 * - "John Smith | Senior Engineer at Google | LinkedIn"
 * - "John Smith - Senior Engineer - Google"
 * - "John Smith at Google"
 */
export function parsePersonDetails(title: string): ParsedPerson {
	// Remove "| LinkedIn" suffix if present
	let cleanTitle = title.replace(/\s*\|\s*LinkedIn\s*$/i, '').trim();

	// Try pipe-separated format first: "Name | Role at Company" or "Name | Role | Company"
	const pipeParts = cleanTitle.split('|').map((s) => s.trim());
	if (pipeParts.length >= 2) {
		const name = pipeParts[0];
		const roleAndCompany = pipeParts.slice(1).join(' | ');

		// Check for "at" pattern in role
		const atMatch = roleAndCompany.match(/^(.+?)\s+at\s+(.+)$/i);
		if (atMatch) {
			return {
				name,
				title: atMatch[1].trim(),
				company: atMatch[2].trim()
			};
		}

		// If multiple parts, last might be company
		if (pipeParts.length >= 3) {
			return {
				name,
				title: pipeParts[1],
				company: pipeParts.slice(2).join(' | ')
			};
		}

		return {
			name,
			title: roleAndCompany,
			company: ''
		};
	}

	// Try "at" pattern: "Name at Company" or "Title at Company"
	const atParts = cleanTitle.split(/\s+at\s+/i);
	if (atParts.length === 2) {
		return {
			name: atParts[0].trim(),
			title: '',
			company: atParts[1].trim()
		};
	}

	// Try dash-separated format: "Name - Title - Company"
	const dashParts = cleanTitle.split(/\s*-\s*/);
	if (dashParts.length >= 3) {
		return {
			name: dashParts[0],
			title: dashParts[1],
			company: dashParts.slice(2).join(' - ')
		};
	}
	if (dashParts.length === 2) {
		return {
			name: dashParts[0],
			title: dashParts[1],
			company: ''
		};
	}

	// Fallback: just use the title as name
	return {
		name: cleanTitle,
		title: '',
		company: ''
	};
}

/**
 * Escape a value for CSV (handle commas, quotes, newlines)
 */
function escapeCSVValue(value: string): string {
	if (value === undefined || value === null) {
		return '';
	}

	const stringValue = String(value);

	// If contains comma, quote, or newline, wrap in quotes and escape internal quotes
	if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
		return `"${stringValue.replace(/"/g, '""')}"`;
	}

	return stringValue;
}

/**
 * Generate CSV content from search results
 * Columns: Qualified, Name, Title, Company, LinkedIn URL, Fit Score, Recently Left, Key Highlights
 */
export function generateCSV(results: SearchResult[]): string {
	const headers = [
		'Qualified',
		'Name',
		'Title',
		'Company',
		'LinkedIn URL',
		'Fit Score',
		'Recently Left',
		'Key Highlights'
	];

	const rows = results.map((result) => {
		const { name, title, company } = parsePersonDetails(result.title);
		const qualified = result.filterMetadata?.qualified ? 'Yes' : 'No';
		const fitScore = result.filterMetadata?.fitScore ?? result.score ?? '';
		const recentlyLeft = result.filterMetadata?.recentlyLeft ? 'Yes' : '';

		// Use AI-generated key highlights from filterMetadata, not raw Exa highlights
		const keyHighlights = result.filterMetadata?.keyHighlights?.slice(0, 3).join('; ') ?? '';

		return [
			escapeCSVValue(qualified),
			escapeCSVValue(name),
			escapeCSVValue(title),
			escapeCSVValue(company),
			escapeCSVValue(result.url),
			escapeCSVValue(String(fitScore)),
			escapeCSVValue(recentlyLeft),
			escapeCSVValue(keyHighlights)
		].join(',');
	});

	return [headers.join(','), ...rows].join('\n');
}

/**
 * Generate a filename for the export
 */
export function generateFilename(query: string, resultCount: number): string {
	// Sanitize query for filename
	const sanitized = query
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.substring(0, 30);

	const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

	return `radar-${sanitized}-${resultCount}-${timestamp}.csv`;
}

/**
 * Trigger file download in browser
 */
export function downloadCSV(content: string, filename: string): void {
	const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
	const url = URL.createObjectURL(blob);

	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.style.display = 'none';

	document.body.appendChild(link);
	link.click();

	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}
