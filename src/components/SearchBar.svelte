<script lang="ts">
	let { value = $bindable(''), onSearch }: { value: string; onSearch: (query: string) => void } = $props();

	// Detect input mode
	type InputMode = 'search' | 'url' | 'jd';

	let inputMode = $derived<InputMode>(() => {
		const trimmed = value.trim();
		if (!trimmed) return 'search';

		// Check if it's a URL
		try {
			new URL(trimmed);
			return 'url';
		} catch {
			// Not a URL
		}

		// Check if it's a job description (long text with job keywords)
		if (trimmed.length > 150) {
			const jobKeywords = ['experience', 'required', 'responsibilities', 'qualifications', 'skills', 'years', 'looking for', 'seeking', 'position', 'role'];
			const lowerText = trimmed.toLowerCase();
			const matches = jobKeywords.filter(kw => lowerText.includes(kw)).length;
			if (matches >= 2) return 'jd';
		}

		return 'search';
	});

	const modeConfig = {
		search: {
			icon: 'search',
			label: 'Search',
			placeholder: 'Search for talent...',
			color: '#007aff'
		},
		url: {
			icon: 'link',
			label: 'Job URL',
			placeholder: 'Paste job posting URL...',
			color: '#34c759'
		},
		jd: {
			icon: 'doc',
			label: 'Job Description',
			placeholder: 'Paste job description...',
			color: '#af52de'
		}
	};

	let currentMode = $derived(modeConfig[inputMode()]);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (value.length >= 3) {
				onSearch(value);
			}
		}
	}

	function handleSubmit() {
		if (value.length >= 3) {
			onSearch(value);
		}
	}
</script>

<div class="search-container">
	<div class="search-box" class:has-content={value.length > 0}>
		<!-- Mode indicator pills -->
		<div class="mode-indicators">
			<button
				type="button"
				class="mode-pill"
				class:active={inputMode() === 'search'}
				onclick={() => { value = ''; }}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="11" cy="11" r="8"></circle>
					<path d="m21 21-4.35-4.35"></path>
				</svg>
				<span>Search</span>
			</button>
			<button
				type="button"
				class="mode-pill"
				class:active={inputMode() === 'url'}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
					<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
				</svg>
				<span>URL</span>
			</button>
			<button
				type="button"
				class="mode-pill"
				class:active={inputMode() === 'jd'}
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
					<polyline points="14 2 14 8 20 8"></polyline>
					<line x1="16" y1="13" x2="8" y2="13"></line>
					<line x1="16" y1="17" x2="8" y2="17"></line>
				</svg>
				<span>Job Description</span>
			</button>
		</div>

		<!-- Input area -->
		<div class="input-wrapper">
			<div class="input-icon" style="color: {currentMode.color}">
				{#if inputMode() === 'search'}
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="11" cy="11" r="8"></circle>
						<path d="m21 21-4.35-4.35"></path>
					</svg>
				{:else if inputMode() === 'url'}
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
						<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
					</svg>
				{:else}
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
						<polyline points="14 2 14 8 20 8"></polyline>
						<line x1="16" y1="13" x2="8" y2="13"></line>
						<line x1="16" y1="17" x2="8" y2="17"></line>
					</svg>
				{/if}
			</div>

			{#if inputMode() === 'jd'}
				<textarea
					bind:value
					onkeydown={handleKeydown}
					placeholder={currentMode.placeholder}
					class="search-input search-textarea"
					rows="4"
				></textarea>
			{:else}
				<input
					type="text"
					bind:value
					onkeydown={handleKeydown}
					placeholder={currentMode.placeholder}
					class="search-input"
				/>
			{/if}

			{#if value.length >= 3}
				<button type="button" class="search-button" onclick={handleSubmit} style="background: {currentMode.color}">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M5 12h14"></path>
						<path d="m12 5 7 7-7 7"></path>
					</svg>
				</button>
			{/if}
		</div>

		<!-- Mode hint -->
		{#if value.length === 0}
			<div class="mode-hint">
				<span class="hint-text">Tip: Paste a job URL or full job description for smarter matching</span>
			</div>
		{:else if inputMode() !== 'search'}
			<div class="mode-badge" style="background: {currentMode.color}15; color: {currentMode.color}">
				{currentMode.label} detected
			</div>
		{/if}
	</div>
</div>

<style>
	.search-container {
		width: 100%;
		max-width: 720px;
		margin: 0 auto 48px;
	}

	.search-box {
		background: #ffffff;
		border-radius: 16px;
		border: 1px solid #e5e5e7;
		transition: all 0.25s ease;
		overflow: hidden;
	}

	.search-box:focus-within {
		border-color: #007aff;
		box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.1), 0 4px 12px rgba(0, 0, 0, 0.08);
	}

	.mode-indicators {
		display: flex;
		gap: 8px;
		padding: 12px 16px;
		border-bottom: 1px solid #f0f0f2;
		background: #fafafa;
	}

	.mode-pill {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 8px;
		border: 1px solid #e5e5e7;
		background: #ffffff;
		color: #86868b;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		font-family: inherit;
	}

	.mode-pill:hover {
		border-color: #d1d1d6;
		color: #1d1d1f;
	}

	.mode-pill.active {
		background: #007aff;
		border-color: #007aff;
		color: #ffffff;
	}

	.mode-pill.active:nth-child(2) {
		background: #34c759;
		border-color: #34c759;
	}

	.mode-pill.active:nth-child(3) {
		background: #af52de;
		border-color: #af52de;
	}

	.input-wrapper {
		display: flex;
		align-items: flex-start;
		padding: 16px;
		gap: 12px;
	}

	.input-icon {
		flex-shrink: 0;
		margin-top: 2px;
		transition: color 0.2s ease;
	}

	.search-input {
		flex: 1;
		border: none;
		background: transparent;
		font-size: 17px;
		color: #1d1d1f;
		outline: none;
		font-family: inherit;
		letter-spacing: -0.022em;
		line-height: 1.4;
	}

	.search-textarea {
		resize: none;
		min-height: 80px;
	}

	.search-input::placeholder {
		color: #86868b;
	}

	.search-button {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		border-radius: 10px;
		border: none;
		color: #ffffff;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.search-button:hover {
		transform: scale(1.05);
		filter: brightness(1.1);
	}

	.search-button:active {
		transform: scale(0.95);
	}

	.mode-hint {
		padding: 0 16px 12px;
	}

	.hint-text {
		font-size: 13px;
		color: #86868b;
	}

	.mode-badge {
		display: inline-flex;
		align-items: center;
		margin: 0 16px 12px;
		padding: 4px 10px;
		border-radius: 6px;
		font-size: 12px;
		font-weight: 600;
	}

	@media (max-width: 640px) {
		.search-container {
			margin-bottom: 32px;
		}

		.mode-indicators {
			padding: 10px 12px;
			gap: 6px;
			overflow-x: auto;
		}

		.mode-pill {
			padding: 5px 10px;
			font-size: 12px;
			white-space: nowrap;
		}

		.mode-pill span {
			display: none;
		}

		.mode-pill.active span {
			display: inline;
		}

		.input-wrapper {
			padding: 12px;
		}

		.search-input {
			font-size: 16px;
		}
	}
</style>
