// Export history store using Svelte 5 runes
import { browser } from '$app/environment';

export interface ExportRecord {
	id: string;
	timestamp: number;
	query: string;
	tier: number;
	resultCount: number;
	filename: string;
}

interface ExportHistoryState {
	records: ExportRecord[];
	activeJobId: string | null;
}

const STORAGE_KEY = 'radar_export_history';
const MAX_RECORDS = 5;
const AUTO_DELETE_MS = 24 * 60 * 60 * 1000; // 24 hours

function createExportHistoryStore() {
	let state = $state<ExportHistoryState>({
		records: [],
		activeJobId: null
	});

	// Initialize from localStorage on client
	function initialize() {
		if (!browser) return;

		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			try {
				const parsed = JSON.parse(stored) as ExportRecord[];
				// Filter out expired records
				state.records = parsed.filter((record) => {
					return Date.now() - record.timestamp < AUTO_DELETE_MS;
				});
				persistToStorage();
			} catch (e) {
				console.error('Failed to parse export history:', e);
				state.records = [];
			}
		}
	}

	function persistToStorage() {
		if (!browser) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state.records));
	}

	function addExport(query: string, tier: number, resultCount: number, filename: string): ExportRecord {
		const record: ExportRecord = {
			id: crypto.randomUUID(),
			timestamp: Date.now(),
			query,
			tier,
			resultCount,
			filename
		};

		// Add to beginning (most recent first)
		state.records = [record, ...state.records];

		// Keep only last 5
		if (state.records.length > MAX_RECORDS) {
			state.records = state.records.slice(0, MAX_RECORDS);
		}

		persistToStorage();
		return record;
	}

	function deleteRecord(id: string) {
		state.records = state.records.filter((r) => r.id !== id);
		persistToStorage();
	}

	function clearHistory() {
		state.records = [];
		persistToStorage();
	}

	function cleanupExpired() {
		const beforeCount = state.records.length;
		state.records = state.records.filter((r) => Date.now() - r.timestamp < AUTO_DELETE_MS);
		if (state.records.length < beforeCount) {
			persistToStorage();
		}
	}

	function setActiveJob(jobId: string | null) {
		state.activeJobId = jobId;
	}

	// Initialize on module load
	if (browser) {
		initialize();
	}

	return {
		get records() {
			return state.records;
		},
		get activeJobId() {
			return state.activeJobId;
		},
		get hasActiveJob() {
			return state.activeJobId !== null;
		},
		get recentExports() {
			return state.records.slice(0, 3);
		},
		addExport,
		deleteRecord,
		clearHistory,
		cleanupExpired,
		setActiveJob,
		initialize
	};
}

export const exportHistory = createExportHistoryStore();
