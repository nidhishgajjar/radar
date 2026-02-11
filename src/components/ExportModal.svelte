<script lang="ts">
	import type { SearchFilters } from '$lib/types/exa';

	let {
		query,
		currentResultCount,
		searchQueries,
		filters,
		onClose,
		onExportCurrent,
		onExportExhaustive
	}: {
		query: string;
		currentResultCount: number;
		searchQueries: string[];
		filters: SearchFilters;
		onClose: () => void;
		onExportCurrent: () => void;
		onExportExhaustive: (jobId: string) => void;
	} = $props();

	let isSubmittingCurrent = $state(false);
	let isSubmittingExhaustive = $state(false);
	let error = $state<string | null>(null);

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}

	function handleEscape(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	function handleExportCurrent() {
		if (isSubmittingCurrent || isSubmittingExhaustive) return;
		isSubmittingCurrent = true;
		onExportCurrent();
		onClose();
	}

	async function handleExportExhaustive() {
		if (isSubmittingCurrent || isSubmittingExhaustive) return;

		isSubmittingExhaustive = true;
		error = null;

		try {
			const response = await fetch('/api/export', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					query,
					searchQueries,
					filters
				})
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to start export');
			}

			const { jobId } = await response.json();
			onExportExhaustive(jobId);
			onClose();
		} catch (err: unknown) {
			error = err instanceof Error ? err.message : 'Failed to start export';
		} finally {
			isSubmittingExhaustive = false;
		}
	}
</script>

<svelte:window onkeydown={handleEscape} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick} onkeydown={handleEscape} role="dialog" aria-modal="true" tabindex="-1">
	<div class="modal-content">
		<button class="close-button" onclick={onClose} aria-label="Close">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<line x1="18" y1="6" x2="6" y2="18"></line>
				<line x1="6" y1="6" x2="18" y2="18"></line>
			</svg>
		</button>

		<div class="modal-header">
			<h2 class="modal-title">Export to CSV</h2>
			<p class="modal-subtitle">
				Export all unique profiles found. Qualified matches appear first.
			</p>
		</div>

		<div class="modal-body">
			<div class="export-options">
				<!-- Option 1: Export Current -->
				<button
					class="export-option"
					onclick={handleExportCurrent}
					disabled={isSubmittingCurrent || isSubmittingExhaustive}
				>
					<div class="option-icon current">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
							<polyline points="7 10 12 15 17 10"></polyline>
							<line x1="12" y1="15" x2="12" y2="3"></line>
						</svg>
					</div>
					<div class="option-content">
						<span class="option-title">Export Current ({currentResultCount})</span>
						<span class="option-desc">Download the {currentResultCount} profiles currently loaded</span>
					</div>
					<div class="option-badge fast">Instant</div>
				</button>

				<!-- Option 2: Exhaustive Search -->
				<button
					class="export-option"
					onclick={handleExportExhaustive}
					disabled={isSubmittingCurrent || isSubmittingExhaustive}
				>
					{#if isSubmittingExhaustive}
						<div class="option-icon exhaustive">
							<span class="spinner-small"></span>
						</div>
					{:else}
						<div class="option-icon exhaustive">
							<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<circle cx="11" cy="11" r="8"></circle>
								<line x1="21" y1="21" x2="16.65" y2="16.65"></line>
								<line x1="11" y1="8" x2="11" y2="14"></line>
								<line x1="8" y1="11" x2="14" y2="11"></line>
							</svg>
						</div>
					{/if}
					<div class="option-content">
						<span class="option-title">Export All (Exhaustive Search)</span>
						<span class="option-desc">Search for all available profiles and export when ready</span>
					</div>
					<div class="option-badge thorough">Thorough</div>
				</button>
			</div>

			<div class="export-info">
				<div class="info-item">
					<span class="info-icon qualified">✓</span>
					<div class="info-text">
						<span class="info-label">Qualified matches first</span>
						<span class="info-desc">Sorted by relevance score</span>
					</div>
				</div>
				<div class="info-item">
					<span class="info-icon other">○</span>
					<div class="info-text">
						<span class="info-label">Other profiles included</span>
						<span class="info-desc">Unique profiles that didn't pass filter</span>
					</div>
				</div>
			</div>

			{#if error}
				<div class="error-box">
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
						<line x1="15" y1="9" x2="9" y2="15"></line>
						<line x1="9" y1="9" x2="15" y2="15"></line>
					</svg>
					<span>{error}</span>
				</div>
			{/if}
		</div>

		<div class="modal-footer">
			<button class="cancel-button" onclick={onClose} disabled={isSubmittingCurrent || isSubmittingExhaustive}> Cancel </button>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}

	.modal-content {
		background: #ffffff;
		border-radius: 16px;
		max-width: 480px;
		width: 100%;
		position: relative;
		box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
		animation: modalSlide 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
	}

	@keyframes modalSlide {
		from {
			opacity: 0;
			transform: translateY(20px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.close-button {
		position: absolute;
		top: 16px;
		right: 16px;
		background: rgba(0, 0, 0, 0.04);
		border: none;
		border-radius: 50%;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: #86868b;
		transition: all 0.2s ease;
		z-index: 10;
	}

	.close-button:hover {
		background: rgba(0, 0, 0, 0.08);
		color: #1d1d1f;
	}

	.modal-header {
		padding: 28px 28px 0;
	}

	.modal-title {
		color: #1d1d1f;
		font-size: 22px;
		font-weight: 700;
		margin: 0 0 8px 0;
		letter-spacing: -0.03em;
	}

	.modal-subtitle {
		color: #86868b;
		font-size: 15px;
		margin: 0;
		line-height: 1.5;
	}

	.modal-body {
		padding: 24px 28px;
	}

	.export-options {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 20px;
	}

	.export-option {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 16px;
		background: #f5f5f7;
		border: 2px solid transparent;
		border-radius: 12px;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		width: 100%;
	}

	.export-option:hover:not(:disabled) {
		background: #f0f0f2;
		border-color: #007aff;
	}

	.export-option:active:not(:disabled) {
		transform: scale(0.99);
	}

	.export-option:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.option-icon {
		width: 44px;
		height: 44px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.option-icon.current {
		background: #007aff;
		color: white;
	}

	.option-icon.exhaustive {
		background: #34c759;
		color: white;
	}

	.option-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.option-title {
		color: #1d1d1f;
		font-size: 15px;
		font-weight: 600;
	}

	.option-desc {
		color: #86868b;
		font-size: 13px;
	}

	.option-badge {
		padding: 4px 10px;
		border-radius: 6px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		flex-shrink: 0;
	}

	.option-badge.fast {
		background: rgba(0, 122, 255, 0.1);
		color: #007aff;
	}

	.option-badge.thorough {
		background: rgba(52, 199, 89, 0.1);
		color: #34c759;
	}

	.spinner-small {
		width: 20px;
		height: 20px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.export-info {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 20px;
		padding: 16px;
		background: #f5f5f7;
		border-radius: 12px;
	}

	.info-item {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}

	.info-icon {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		font-weight: 700;
		flex-shrink: 0;
		margin-top: 2px;
	}

	.info-icon.qualified {
		background: #34c759;
		color: white;
	}

	.info-icon.other {
		background: #e8e8ed;
		color: #86868b;
	}

	.info-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.info-label {
		color: #1d1d1f;
		font-size: 14px;
		font-weight: 600;
	}

	.info-desc {
		color: #86868b;
		font-size: 12px;
	}

	.info-box {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 14px 16px;
		background: rgba(0, 122, 255, 0.06);
		border-radius: 10px;
		color: #007aff;
		font-size: 13px;
		line-height: 1.5;
	}

	.info-box svg {
		flex-shrink: 0;
		margin-top: 1px;
	}

	.error-box {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 14px 16px;
		background: rgba(255, 59, 48, 0.08);
		border-radius: 10px;
		color: #ff3b30;
		font-size: 13px;
		line-height: 1.5;
		margin-top: 12px;
	}

	.error-box svg {
		flex-shrink: 0;
		margin-top: 1px;
	}

	.modal-footer {
		display: flex;
		justify-content: center;
		padding: 16px 28px 24px;
	}

	.cancel-button {
		padding: 10px 24px;
		background: transparent;
		border: none;
		border-radius: 10px;
		color: #86868b;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.cancel-button:hover:not(:disabled) {
		background: rgba(0, 0, 0, 0.04);
		color: #1d1d1f;
	}

	.cancel-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 540px) {
		.modal-footer {
			flex-direction: column;
		}

		.cancel-button,
		.export-button {
			width: 100%;
			justify-content: center;
		}
	}
</style>
