import type { SearchResult } from '$lib/types/exa';

interface FilterState {
	searchId: string;
	status: 'in_progress' | 'completed' | 'error';
	progress: number; // 0-100
	total: number;
	processed: number;
	results: SearchResult[];
	error?: string;
	startedAt: Date;
	completedAt?: Date;
}

class FilterStateManager {
	private states: Map<string, FilterState>;
	private readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
	private cleanupTimer?: NodeJS.Timeout;

	constructor() {
		this.states = new Map();
		this.startCleanupTimer();
	}

	/**
	 * Initialize a new filtering task
	 */
	createFilteringTask(searchId: string, totalResults: number): void {
		this.states.set(searchId, {
			searchId,
			status: 'in_progress',
			progress: 0,
			total: totalResults,
			processed: 0,
			results: [],
			startedAt: new Date()
		});
	}

	/**
	 * Update progress with partial results
	 */
	updateProgress(
		searchId: string,
		processedCount: number,
		partialResults: SearchResult[]
	): void {
		const state = this.states.get(searchId);
		if (!state) return;

		state.processed = processedCount;
		state.progress = Math.round((processedCount / state.total) * 100);
		state.results = partialResults;
	}

	/**
	 * Mark filtering as completed
	 */
	markCompleted(searchId: string, finalResults: SearchResult[]): void {
		const state = this.states.get(searchId);
		if (!state) return;

		state.status = 'completed';
		state.progress = 100;
		state.processed = state.total;
		state.results = finalResults;
		state.completedAt = new Date();
	}

	/**
	 * Mark filtering as errored
	 */
	markError(searchId: string, error: string): void {
		const state = this.states.get(searchId);
		if (!state) return;

		state.status = 'error';
		state.error = error;
		state.completedAt = new Date();
	}

	/**
	 * Get current state for a search ID
	 */
	getState(searchId: string): FilterState | undefined {
		return this.states.get(searchId);
	}

	/**
	 * Remove state (after client retrieves final results)
	 */
	removeState(searchId: string): void {
		this.states.delete(searchId);
	}

	/**
	 * Cleanup old states (> 1 hour)
	 */
	private cleanup(): void {
		const now = Date.now();
		const staleThreshold = this.CLEANUP_INTERVAL;

		for (const [searchId, state] of this.states.entries()) {
			const age = now - state.startedAt.getTime();
			if (age > staleThreshold) {
				console.log(`Cleaning up stale filter state: ${searchId}`);
				this.states.delete(searchId);
			}
		}
	}

	private startCleanupTimer(): void {
		// Run cleanup every 15 minutes
		this.cleanupTimer = setInterval(() => {
			this.cleanup();
		}, 15 * 60 * 1000);

		// Don't keep process alive for cleanup timer
		if (this.cleanupTimer.unref) {
			this.cleanupTimer.unref();
		}
	}

	/**
	 * Stop cleanup timer (for testing/shutdown)
	 */
	stopCleanup(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
		}
	}
}

// Singleton instance
export const filterStateManager = new FilterStateManager();
