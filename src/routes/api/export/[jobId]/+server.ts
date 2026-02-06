import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { exportStateManager } from '$lib/server/export-state-manager';
import { generateFilename } from '$lib/utils/csv';

/**
 * Filter CSV content to only include qualified leads (Qualified = "Yes")
 */
function filterQualifiedOnly(csvContent: string): { content: string; count: number } {
	const lines = csvContent.split('\n');
	if (lines.length < 2) return { content: csvContent, count: 0 };

	const header = lines[0];
	const dataRows = lines.slice(1).filter(line => line.trim());

	// Find the Qualified column index (should be first column)
	const headerCols = header.split(',');
	const qualifiedIndex = headerCols.findIndex(col => col.toLowerCase().includes('qualified'));

	if (qualifiedIndex === -1) {
		// No Qualified column, return all
		return { content: csvContent, count: dataRows.length };
	}

	// Filter rows where Qualified = "Yes"
	const qualifiedRows = dataRows.filter(row => {
		// Handle CSV parsing (basic - assumes Qualified column doesn't have commas)
		const cols = row.split(',');
		const qualifiedValue = cols[qualifiedIndex]?.replace(/"/g, '').trim().toLowerCase();
		return qualifiedValue === 'yes';
	});

	return {
		content: [header, ...qualifiedRows].join('\n'),
		count: qualifiedRows.length
	};
}

export const GET: RequestHandler = async ({ params, url }) => {
	const { jobId } = params;
	const download = url.searchParams.get('download') === 'true';
	const qualifiedOnly = url.searchParams.get('qualifiedOnly') === 'true';

	if (!jobId) {
		throw error(400, 'Job ID is required');
	}

	const job = exportStateManager.getJob(jobId);

	if (!job) {
		throw error(404, 'Export job not found');
	}

	// If download requested and job is ready, return CSV file
	if (download && job.status === 'ready' && job.csvContent) {
		let csvContent = job.csvContent;
		let resultCount = job.resultCount || 0;

		// Filter to qualified only if requested
		if (qualifiedOnly) {
			const filtered = filterQualifiedOnly(csvContent);
			csvContent = filtered.content;
			resultCount = filtered.count;
		}

		const filename = generateFilename(
			job.query + (qualifiedOnly ? '-qualified' : ''),
			resultCount
		);

		return new Response(csvContent, {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="${filename}"`,
				'Cache-Control': 'no-cache'
			}
		});
	}

	// Return job status for polling
	return json({
		id: job.id,
		status: job.status,
		progress: job.progress,
		tier: job.tier,
		query: job.query,
		resultCount: job.resultCount,
		error: job.error,
		stats: job.stats
	});
};
