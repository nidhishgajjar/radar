<script lang="ts">
	import { onMount } from 'svelte';

	export type ToastType = 'success' | 'error' | 'info' | 'progress';

	export interface ExportStats {
		totalRawSearched: number;
		totalAfterDedup: number;
		totalPassedFilter: number;
		searchExhausted: boolean;
		stopReason: string;
	}

	let {
		message,
		type = 'info',
		progress = 0,
		downloadUrl,
		stats,
		onClose,
		autoDismiss = true,
		duration = 5000
	}: {
		message: string;
		type?: ToastType;
		progress?: number;
		downloadUrl?: string;
		stats?: ExportStats;
		onClose: () => void;
		autoDismiss?: boolean;
		duration?: number;
	} = $props();

	let visible = $state(false);

	onMount(() => {
		// Trigger enter animation
		requestAnimationFrame(() => {
			visible = true;
		});

		// Auto dismiss
		if (autoDismiss && type !== 'progress') {
			const timer = setTimeout(() => {
				handleClose();
			}, duration);

			return () => clearTimeout(timer);
		}
	});

	function handleClose() {
		visible = false;
		setTimeout(onClose, 200); // Wait for exit animation
	}

	function handleDownload() {
		if (downloadUrl) {
			window.open(downloadUrl, '_blank');
		}
	}

	const icons = {
		success: `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>`,
		error: `<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>`,
		info: `<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>`,
		progress: `<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>`
	};
</script>

<div class="toast" class:visible class:success={type === 'success'} class:error={type === 'error'} class:progress={type === 'progress'}>
	<div class="toast-icon">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			{@html icons[type]}
		</svg>
	</div>

	<div class="toast-content">
		<span class="toast-message">{message}</span>

		{#if stats}
			<div class="stats-row">
				<span class="stat">{stats.totalRawSearched} searched</span>
				<span class="stat-sep">→</span>
				<span class="stat">{stats.totalAfterDedup} unique</span>
				<span class="stat-sep">→</span>
				<span class="stat">{stats.totalPassedFilter} qualified</span>
				{#if stats.searchExhausted}
					<span class="exhausted-badge">exhausted</span>
				{/if}
			</div>
		{/if}

		{#if type === 'progress'}
			<div class="progress-bar">
				<div class="progress-fill" style="width: {progress}%"></div>
			</div>
		{/if}

		{#if downloadUrl}
			<button class="download-link" onclick={handleDownload}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
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
				Download CSV
			</button>
		{/if}
	</div>

	<button class="close-button" onclick={handleClose} aria-label="Dismiss">
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
			<line x1="18" y1="6" x2="6" y2="18"></line>
			<line x1="6" y1="6" x2="18" y2="18"></line>
		</svg>
	</button>
</div>

<style>
	.toast {
		position: fixed;
		bottom: 24px;
		right: 24px;
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 16px;
		background: #1d1d1f;
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.24);
		z-index: 1100;
		max-width: 400px;
		opacity: 0;
		transform: translateY(16px);
		transition: all 0.2s ease;
	}

	.toast.visible {
		opacity: 1;
		transform: translateY(0);
	}

	.toast.success {
		background: #34c759;
	}

	.toast.error {
		background: #ff3b30;
	}

	.toast.progress {
		background: #1d1d1f;
	}

	.toast-icon {
		flex-shrink: 0;
		color: white;
		opacity: 0.9;
	}

	.toast-content {
		flex: 1;
		min-width: 0;
	}

	.toast-message {
		color: white;
		font-size: 14px;
		font-weight: 500;
		line-height: 1.4;
		display: block;
	}

	.stats-row {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: 6px;
		flex-wrap: wrap;
	}

	.stat {
		color: rgba(255, 255, 255, 0.7);
		font-size: 12px;
		font-weight: 400;
	}

	.stat-sep {
		color: rgba(255, 255, 255, 0.4);
		font-size: 11px;
	}

	.exhausted-badge {
		background: rgba(255, 255, 255, 0.15);
		color: rgba(255, 255, 255, 0.8);
		font-size: 10px;
		font-weight: 600;
		padding: 2px 6px;
		border-radius: 4px;
		margin-left: 4px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.progress-bar {
		height: 4px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 2px;
		margin-top: 10px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: #007aff;
		border-radius: 2px;
		transition: width 0.3s ease;
	}

	.download-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-top: 10px;
		padding: 6px 12px;
		background: rgba(255, 255, 255, 0.15);
		border: none;
		border-radius: 6px;
		color: white;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s ease;
	}

	.download-link:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.close-button {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 50%;
		color: rgba(255, 255, 255, 0.7);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.close-button:hover {
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}

	@media (max-width: 480px) {
		.toast {
			left: 16px;
			right: 16px;
			bottom: 16px;
			max-width: none;
		}
	}
</style>
