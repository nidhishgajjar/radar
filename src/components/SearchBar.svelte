<script lang="ts">
	type SearchMode = 'search' | 'export';
	let { value = $bindable(''), flexibleLocation = $bindable(false), companyEnrichment = $bindable(true), searchMode = $bindable<SearchMode>('search'), onSearch }: { value: string; flexibleLocation: boolean; companyEnrichment: boolean; searchMode: SearchMode; onSearch: (query: string, mode: SearchMode) => void } = $props();

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
			color: '#007aff'
		},
		jd: {
			icon: 'doc',
			label: 'Job Description',
			placeholder: 'Paste job description...',
			color: '#007aff'
		}
	};

	let currentMode = $derived(modeConfig[inputMode()]);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (value.length >= 3) {
				onSearch(value, searchMode);
			}
		}
	}

	function handleSubmit() {
		if (value.length >= 3) {
			onSearch(value, searchMode);
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

		<!-- Options row -->
		<div class="options-row">
			<div class="toggle-options">
				<label class="toggle-option">
					<input type="checkbox" bind:checked={flexibleLocation} />
					<span class="toggle-label">Flexible location</span>
				</label>
				<label class="toggle-option">
					<input type="checkbox" bind:checked={companyEnrichment} />
					<span class="toggle-label">Company data</span>
				</label>
			</div>

			<div class="search-mode-toggle">
				<button
					type="button"
					class="mode-toggle-btn"
					class:active={searchMode === 'search'}
					onclick={() => searchMode = 'search'}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="11" cy="11" r="8"></circle>
						<path d="m21 21-4.35-4.35"></path>
					</svg>
					Search
				</button>
				<button
					type="button"
					class="mode-toggle-btn"
					class:active={searchMode === 'export'}
					onclick={() => searchMode = 'export'}
				>
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
						<polyline points="7 10 12 15 17 10"></polyline>
						<line x1="12" y1="15" x2="12" y2="3"></line>
					</svg>
					Export
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.toggle-options {
		display: flex;
		gap: 16px;
	}
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

	.options-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 16px 12px;
		border-top: 1px solid #f0f0f2;
	}

	.toggle-option {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		user-select: none;
	}

	.toggle-option input[type="checkbox"] {
		width: 16px;
		height: 16px;
		accent-color: #007aff;
		cursor: pointer;
	}

	.toggle-label {
		font-size: 13px;
		color: #86868b;
	}

	.toggle-option:hover .toggle-label {
		color: #1d1d1f;
	}


	.search-mode-toggle {
		display: flex;
		background: #f5f5f7;
		border-radius: 8px;
		padding: 2px;
		gap: 2px;
	}

	.mode-toggle-btn {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 6px 12px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: #86868b;
		font-size: 12px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: inherit;
	}

	.mode-toggle-btn:hover {
		color: #1d1d1f;
	}

	.mode-toggle-btn.active {
		background: #ffffff;
		color: #1d1d1f;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
	}

	.mode-toggle-btn.active:last-child {
		color: #007aff;
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
