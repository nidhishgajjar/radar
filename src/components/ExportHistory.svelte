<script lang="ts">
	import { exportHistory, type ExportRecord } from '$lib/stores/export.svelte';

	let { onDownload }: { onDownload: (jobId: string) => void } = $props();

	let isOpen = $state(false);

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	function handleClickOutside(e: MouseEvent) {
		const target = e.target as HTMLElement;
		if (!target.closest('.export-history')) {
			isOpen = false;
		}
	}

	function handleDownload(record: ExportRecord) {
		// For now, we'll trigger a re-download notification
		// In a real implementation, we'd store the jobId or CSV content
		onDownload(record.id);
		isOpen = false;
	}

	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMins / 60);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;
		if (diffHours < 24) return `${diffHours}h ago`;

		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function truncateQuery(query: string, maxLength: number = 30): string {
		if (query.length <= maxLength) return query;
		return query.substring(0, maxLength) + '...';
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class="export-history">
	<button
		class="history-button"
		onclick={toggleDropdown}
		aria-expanded={isOpen}
		aria-haspopup="true"
		disabled={exportHistory.records.length === 0}
	>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<circle cx="12" cy="12" r="10"></circle>
			<polyline points="12 6 12 12 16 14"></polyline>
		</svg>
		History
		{#if exportHistory.records.length > 0}
			<span class="count-badge">{exportHistory.records.length}</span>
		{/if}
	</button>

	{#if isOpen && exportHistory.records.length > 0}
		<div class="dropdown">
			<div class="dropdown-header">
				<span>Recent Exports</span>
				<button class="clear-button" onclick={() => exportHistory.clearHistory()}>
					Clear all
				</button>
			</div>

			<ul class="history-list">
				{#each exportHistory.records as record (record.id)}
					<li class="history-item">
						<div class="item-content">
							<span class="item-query" title={record.query}>
								{truncateQuery(record.query)}
							</span>
							<div class="item-meta">
								<span class="item-count">{record.resultCount} candidates</span>
								<span class="item-dot">·</span>
								<span class="item-time">{formatDate(record.timestamp)}</span>
							</div>
						</div>
						<button
							class="download-button"
							onclick={() => handleDownload(record)}
							aria-label="Download"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
								<polyline points="7 10 12 15 17 10"></polyline>
								<line x1="12" y1="15" x2="12" y2="3"></line>
							</svg>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.export-history {
		position: relative;
	}

	.history-button {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		background: transparent;
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 8px;
		color: #86868b;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.history-button:hover:not(:disabled) {
		background: rgba(0, 0, 0, 0.04);
		color: #1d1d1f;
	}

	.history-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.count-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 5px;
		background: #007aff;
		border-radius: 9px;
		color: white;
		font-size: 11px;
		font-weight: 600;
	}

	.dropdown {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		min-width: 320px;
		background: white;
		border: 1px solid rgba(0, 0, 0, 0.08);
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
		z-index: 100;
		animation: dropdownSlide 0.15s ease;
	}

	@keyframes dropdownSlide {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.dropdown-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
	}

	.dropdown-header span {
		color: #86868b;
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.clear-button {
		background: none;
		border: none;
		color: #ff3b30;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.2s ease;
	}

	.clear-button:hover {
		opacity: 0.7;
	}

	.history-list {
		list-style: none;
		margin: 0;
		padding: 8px;
		max-height: 280px;
		overflow-y: auto;
	}

	.history-item {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		border-radius: 8px;
		transition: background 0.15s ease;
	}

	.history-item:hover {
		background: rgba(0, 0, 0, 0.04);
	}

	.item-content {
		flex: 1;
		min-width: 0;
	}

	.item-query {
		display: block;
		color: #1d1d1f;
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.item-meta {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: 2px;
		color: #86868b;
		font-size: 12px;
	}

	.item-dot {
		opacity: 0.5;
	}

	.download-button {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: rgba(0, 122, 255, 0.08);
		border: none;
		border-radius: 8px;
		color: #007aff;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.download-button:hover {
		background: rgba(0, 122, 255, 0.15);
	}

	.download-button:active {
		transform: scale(0.95);
	}
</style>
