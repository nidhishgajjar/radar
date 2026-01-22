import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { filterStateManager } from '$lib/server/filter-state-manager';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const searchId = url.searchParams.get('searchId');

		if (!searchId) {
			return json({ error: 'searchId is required' }, { status: 400 });
		}

		// Get current filter state
		const state = filterStateManager.getState(searchId);

		if (!state) {
			return json(
				{
					error: 'Search ID not found or expired',
					status: 'not_found'
				},
				{ status: 404 }
			);
		}

		// Return current state
		return json({
			searchId: state.searchId,
			status: state.status,
			progress: state.progress,
			total: state.total,
			processed: state.processed,
			results: state.results,
			error: state.error,
			metadata: {
				startedAt: state.startedAt,
				completedAt: state.completedAt,
				total_results_before_filter: state.total,
				total_results_after_filter: state.results.length
			}
		});
	} catch (error: any) {
		console.error('Filter polling error:', error);
		return json(
			{
				error: 'Internal server error',
				status: 'error'
			},
			{ status: 500 }
		);
	}
};
