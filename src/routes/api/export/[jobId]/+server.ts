import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { exportStateManager } from '$lib/server/export-state-manager';
import { generateFilename } from '$lib/utils/csv';

export const GET: RequestHandler = async ({ params, url }) => {
	const { jobId } = params;
	const download = url.searchParams.get('download') === 'true';

	if (!jobId) {
		throw error(400, 'Job ID is required');
	}

	const job = exportStateManager.getJob(jobId);

	if (!job) {
		throw error(404, 'Export job not found');
	}

	// If download requested and job is ready, return CSV file
	if (download && job.status === 'ready' && job.csvContent) {
		const filename = generateFilename(job.query, job.resultCount || 0);

		return new Response(job.csvContent, {
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
