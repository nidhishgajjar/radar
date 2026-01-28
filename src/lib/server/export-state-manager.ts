import type { SearchResult } from '$lib/types/exa';

export type ExportStatus = 'queued' | 'generating_queries' | 'fetching' | 'filtering' | 'enriching' | 'generating_csv' | 'ready' | 'error';

export interface ExportStats {
	totalRawSearched: number;      // Total profiles fetched from Exa
	totalAfterDedup: number;       // After deduplication
	totalPassedFilter: number;     // After LLM filtering
	queriesUsed?: number;          // Number of search queries used
	searchExhausted: boolean;      // True if no more results available from Exa
	stopReason: 'target_reached' | 'search_exhausted' | 'diminishing_returns' | 'error';
	llmCost?: number;              // LLM cost in USD
	exaEnrichmentCost?: number;    // Exa company enrichment cost in USD
}

export interface ExportJob {
	id: string;
	status: ExportStatus;
	progress: number; // 0-100
	tier: number;
	query: string;
	createdAt: number;
	results?: SearchResult[];
	csvContent?: string;
	resultCount?: number;
	error?: string;
	stats?: ExportStats;
}

class ExportStateManager {
	private jobs: Map<string, ExportJob>;
	private readonly CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
	private cleanupTimer?: NodeJS.Timeout;

	constructor() {
		this.jobs = new Map();
		this.startCleanupTimer();
	}

	/**
	 * Create a new export job
	 */
	createJob(id: string, query: string, tier: number): ExportJob {
		const job: ExportJob = {
			id,
			status: 'queued',
			progress: 0,
			tier,
			query,
			createdAt: Date.now()
		};
		this.jobs.set(id, job);
		return job;
	}

	/**
	 * Update job status
	 */
	updateStatus(id: string, status: ExportStatus, progress?: number): void {
		const job = this.jobs.get(id);
		if (!job) return;

		job.status = status;
		if (progress !== undefined) {
			job.progress = progress;
		}
	}

	/**
	 * Update progress percentage
	 */
	updateProgress(id: string, progress: number, resultCount?: number): void {
		const job = this.jobs.get(id);
		if (!job) return;

		job.progress = Math.min(100, Math.max(0, progress));
		if (resultCount !== undefined) {
			job.resultCount = resultCount;
		}
	}

	/**
	 * Update export stats
	 */
	updateStats(id: string, stats: Partial<ExportStats>): void {
		const job = this.jobs.get(id);
		if (!job) return;

		job.stats = { ...job.stats, ...stats } as ExportStats;
	}

	/**
	 * Mark job as ready with CSV content
	 */
	markReady(id: string, csvContent: string, resultCount: number, stats?: ExportStats): void {
		const job = this.jobs.get(id);
		if (!job) return;

		job.status = 'ready';
		job.progress = 100;
		job.csvContent = csvContent;
		job.resultCount = resultCount;
		if (stats) {
			job.stats = stats;
		}
	}

	/**
	 * Mark job as errored
	 */
	markError(id: string, error: string): void {
		const job = this.jobs.get(id);
		if (!job) return;

		job.status = 'error';
		job.error = error;
	}

	/**
	 * Get job by ID
	 */
	getJob(id: string): ExportJob | undefined {
		return this.jobs.get(id);
	}

	/**
	 * Remove job after download
	 */
	removeJob(id: string): void {
		this.jobs.delete(id);
	}

	/**
	 * Cleanup old jobs (> 1 hour)
	 */
	private cleanup(): void {
		const now = Date.now();
		const staleThreshold = this.CLEANUP_INTERVAL;

		for (const [id, job] of this.jobs.entries()) {
			const age = now - job.createdAt;
			if (age > staleThreshold) {
				console.log(`Cleaning up stale export job: ${id}`);
				this.jobs.delete(id);
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
export const exportStateManager = new ExportStateManager();
