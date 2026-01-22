<script lang="ts">
	import SearchBar from '../components/SearchBar.svelte';
	import PersonCard from '../components/PersonCard.svelte';
	import ProfileModal from '../components/ProfileModal.svelte';
	import LoadingState from '../components/LoadingState.svelte';
	import EmptyState from '../components/EmptyState.svelte';
	import ErrorMessage from '../components/ErrorMessage.svelte';
	import type { SearchResult } from '$lib/types/exa';

	let query = $state('');
	let results: SearchResult[] = $state([]);
	let loading = $state(false);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);
	let hasSearched = $state(false);
	let selectedPerson = $state<SearchResult | null>(null);
	let metadata = $state<any>(null);
	let currentPage = $state(1);
	let hasMore = $state(false);
	let queries: string[] = $state([]);

	// Two-phase loading state
	let searchId = $state<string | null>(null);
	let filteringInProgress = $state(false);
	let filterProgress = $state(0);

	async function handleSearch(searchQuery: string) {
		query = searchQuery;
		loading = true;
		error = null;
		hasSearched = true;
		metadata = null;
		currentPage = 1;
		hasMore = false;
		filteringInProgress = false;
		filterProgress = 0;

		try {
			const response = await fetch('/api/search/people', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					query: searchQuery,
					page: 1,
					filters: {
						externalOnly: true
					}
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Search failed');
			}

			// Phase 1: Show raw results immediately
			results = data.results || [];
			metadata = data.metadata || null;
			queries = data.queries || [];
			hasMore = results.length >= 20;
			searchId = data.searchId || null;

			// Phase 2: Start polling if filtering is pending
			if (data.status === 'filtering_pending' && searchId) {
				filteringInProgress = true;
				pollFilterProgress(searchId);
			}
		} catch (err: any) {
			error = err.message || 'An error occurred while searching';
			results = [];
		} finally {
			loading = false;
		}
	}

	// Poll for filter progress and update results progressively
	async function pollFilterProgress(sid: string) {
		let pollCount = 0;
		const maxPolls = 60; // 2 minutes max (2 seconds * 60)

		const poll = async () => {
			if (pollCount >= maxPolls || sid !== searchId) {
				// Timeout or user started new search
				filteringInProgress = false;
				return;
			}

			try {
				const response = await fetch(`/api/search/people/filter?searchId=${sid}`);
				const data = await response.json();

				if (!response.ok) {
					console.error('Filter polling failed:', data.error);
					filteringInProgress = false;
					return;
				}

				// Update progress
				filterProgress = data.progress || 0;

				// Update results with filtered data if available
				if (data.results && data.results.length > 0) {
					results = data.results;
				}

				// Check if complete
				if (data.status === 'completed') {
					filteringInProgress = false;
					filterProgress = 100;
					return;
				}

				if (data.status === 'error') {
					console.error('Filtering error:', data.error);
					filteringInProgress = false;
					return;
				}

				// Continue polling
				pollCount++;
				setTimeout(poll, 2000); // Poll every 2 seconds
			} catch (err) {
				console.error('Polling error:', err);
				filteringInProgress = false;
			}
		};

		// Start polling after small delay
		setTimeout(poll, 1000);
	}

	async function handleLoadMore() {
		if (!query || loadingMore) return;

		loadingMore = true;
		error = null;
		const nextPage = currentPage + 1;

		try {
			const response = await fetch('/api/search/people', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					query,
					page: nextPage,
					queries,
					filters: {
						externalOnly: true
					}
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to load more results');
			}

			const newResults: SearchResult[] = data.results || [];

			// Filter out duplicates and append new results
			const existingIds = new Set(results.map(r => r.id));
			const uniqueNewResults = newResults.filter(r => !existingIds.has(r.id));

			results = [...results, ...uniqueNewResults];
			currentPage = nextPage;
			hasMore = uniqueNewResults.length > 0;

			// Start polling for Load More results if filtering is pending
			if (data.status === 'filtering_pending' && data.searchId) {
				filteringInProgress = true;
				searchId = data.searchId;
				pollFilterProgress(data.searchId);
			}
		} catch (err: any) {
			error = err.message || 'Failed to load more results';
		} finally {
			loadingMore = false;
		}
	}

	function handleRetry() {
		if (query) {
			handleSearch(query);
		}
	}

	function openProfile(person: SearchResult) {
		selectedPerson = person;
	}

	function closeProfile() {
		selectedPerson = null;
	}
</script>

<svelte:head>
	<title>Radar - Talent Intelligence Platform</title>
	<meta name="description" content="Find and connect with top talent across Canada using AI-powered search" />
</svelte:head>

<div class="page">
	<div class="container">
		<header class="header">
			<h1 class="title">Radar</h1>
			<p class="subtitle">Talent intelligence for smarter hiring</p>
		</header>

		<SearchBar bind:value={query} onSearch={handleSearch} />

		{#if loading}
			<LoadingState />
		{:else if error}
			<ErrorMessage message={error} onRetry={handleRetry} />
		{:else if hasSearched && results.length === 0}
			<EmptyState {query} />
		{:else if results.length > 0}
			<div class="results-section">
				{#if metadata?.llm_used && metadata.refined_query !== metadata.original_query}
					<p class="refined-query-info">
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
							<polyline points="7 10 12 15 17 10"></polyline>
							<line x1="12" y1="15" x2="12" y2="3"></line>
						</svg>
						Optimized search
					</p>
				{/if}
				<p class="results-count">
					{results.length} {results.length === 1 ? 'result' : 'results'}
				</p>
				{#if filteringInProgress}
					<div class="filtering-indicator">
						<div class="filtering-status">
							<div class="filtering-spinner"></div>
							<span>Analyzing candidates... {filterProgress}%</span>
						</div>
						<div class="filtering-progress-bar">
							<div class="filtering-progress-fill" style="width: {filterProgress}%"></div>
						</div>
					</div>
				{/if}
				<div class="results-grid">
					{#each results as person (person.id)}
						<PersonCard {person} onClick={() => openProfile(person)} />
					{/each}
				</div>
				{#if hasMore}
					<div class="load-more-container">
						<button class="load-more-button" onclick={handleLoadMore} disabled={loadingMore}>
							{loadingMore ? 'Loading...' : 'Load More'}
						</button>
					</div>
				{/if}
			</div>
		{:else}
			<div class="empty-state">
				<div class="examples">
					<p class="examples-label">Try searching for:</p>
					<div class="example-chips">
						<button class="chip" onclick={() => handleSearch('Senior software engineers in Toronto')}>
							Senior software engineers in Toronto
						</button>
						<button class="chip" onclick={() => handleSearch('Marketing directors at tech companies in Vancouver')}>
							Marketing directors at tech companies in Vancouver
						</button>
						<button class="chip" onclick={() => handleSearch('Data scientists with machine learning experience')}>
							Data scientists with machine learning experience
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>

	<div class="coming-soon-section">
		<div class="coming-soon-container">
			<div class="coming-soon-badge">Coming Soon</div>
			<h2 class="coming-soon-title">Direct Outreach Features</h2>
			<p class="coming-soon-subtitle">
				Connect with talent directly from Radar through multiple channels
			</p>
			<div class="features-grid">
				<div class="feature-card">
					<svg class="feature-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
						<rect x="2" y="9" width="4" height="12"></rect>
						<circle cx="4" cy="4" r="2"></circle>
					</svg>
					<h3 class="feature-title">LinkedIn Outreach</h3>
					<p class="feature-description">Send personalized connection requests and messages</p>
				</div>
				<div class="feature-card">
					<svg class="feature-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="2" y="4" width="20" height="16" rx="2"></rect>
						<path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
					</svg>
					<h3 class="feature-title">Email Outreach</h3>
					<p class="feature-description">Find verified emails and send targeted campaigns</p>
				</div>
				<div class="feature-card">
					<svg class="feature-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
					</svg>
					<h3 class="feature-title">Phone Contact</h3>
					<p class="feature-description">Access phone numbers for direct conversations</p>
				</div>
			</div>
		</div>
	</div>
</div>

{#if selectedPerson}
	<ProfileModal person={selectedPerson} onClose={closeProfile} />
{/if}

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: #ffffff;
	}

	.container {
		flex: 1;
		max-width: 980px;
		width: 100%;
		margin: 0 auto;
		padding: 0 20px;
	}

	.header {
		text-align: center;
		padding: 60px 20px 48px;
	}

	.title {
		font-size: 72px;
		font-weight: 700;
		margin: 0 0 4px 0;
		letter-spacing: -0.04em;
		color: #1d1d1f;
		line-height: 1.07143;
	}

	.subtitle {
		font-size: 21px;
		color: #86868b;
		margin: 8px 0 0 0;
		font-weight: 400;
		letter-spacing: -0.022em;
		line-height: 1.19048;
	}

	.results-section {
		margin-top: 8px;
	}

	.refined-query-info {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: #007aff;
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 12px;
		letter-spacing: -0.022em;
	}

	.refined-query-info svg {
		flex-shrink: 0;
	}

	.results-count {
		color: #86868b;
		font-size: 15px;
		font-weight: 500;
		margin-bottom: 24px;
		letter-spacing: -0.022em;
	}

	.filtering-indicator {
		background: #f5f5f7;
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 24px;
	}

	.filtering-status {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 12px;
		font-size: 14px;
		font-weight: 500;
		color: #1d1d1f;
	}

	.filtering-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid #e5e5e7;
		border-top-color: #0071e3;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.filtering-progress-bar {
		width: 100%;
		height: 6px;
		background: #e5e5e7;
		border-radius: 3px;
		overflow: hidden;
	}

	.filtering-progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #0071e3 0%, #0077ed 100%);
		border-radius: 3px;
		transition: width 0.3s ease;
	}

	.results-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
		margin-bottom: 80px;
	}

	.empty-state {
		text-align: center;
		padding: 60px 20px;
		max-width: 600px;
		margin: 0 auto;
	}

	.examples {
		max-width: 500px;
		margin: 0 auto;
	}

	.examples-label {
		color: #1d1d1f;
		font-size: 17px;
		font-weight: 500;
		margin: 0 0 16px 0;
		letter-spacing: -0.022em;
	}

	.example-chips {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.chip {
		background: #f5f5f7;
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: 10px;
		padding: 14px 18px;
		font-size: 15px;
		color: #1d1d1f;
		cursor: pointer;
		transition: all 0.2s ease;
		text-align: left;
		font-family: inherit;
		letter-spacing: -0.022em;
		font-weight: 400;
	}

	.chip:hover {
		background: #e8e8ed;
		border-color: rgba(0, 122, 255, 0.2);
	}

	.chip:active {
		transform: scale(0.98);
	}

	.load-more-container {
		text-align: center;
		margin-top: 32px;
		padding-top: 32px;
		border-top: 1px solid rgba(0, 0, 0, 0.06);
	}

	.load-more-button {
		background: #007aff;
		color: white;
		border: none;
		padding: 12px 32px;
		border-radius: 10px;
		font-weight: 500;
		font-size: 15px;
		cursor: pointer;
		transition: all 0.2s ease;
		letter-spacing: -0.022em;
		font-family: inherit;
	}

	.load-more-button:hover {
		background: #0051d5;
		box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
	}

	.load-more-button:active {
		transform: scale(0.98);
	}

	.load-more-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.coming-soon-section {
		background: #f5f5f7;
		border-top: 1px solid rgba(0, 0, 0, 0.06);
		padding: 80px 20px;
		margin-top: 80px;
	}

	.coming-soon-container {
		max-width: 980px;
		margin: 0 auto;
		text-align: center;
	}

	.coming-soon-badge {
		display: inline-block;
		background: rgba(0, 122, 255, 0.1);
		color: #007aff;
		padding: 6px 16px;
		border-radius: 20px;
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		margin-bottom: 24px;
	}

	.coming-soon-title {
		color: #1d1d1f;
		font-size: 40px;
		font-weight: 700;
		margin: 0 0 16px 0;
		letter-spacing: -0.04em;
	}

	.coming-soon-subtitle {
		color: #86868b;
		font-size: 19px;
		margin: 0 0 48px 0;
		line-height: 1.47059;
		letter-spacing: -0.022em;
	}

	.features-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 20px;
		margin-top: 48px;
	}

	.feature-card {
		background: #ffffff;
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: 12px;
		padding: 32px 24px;
		text-align: center;
		transition: all 0.2s ease;
	}

	.feature-card:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
		border-color: rgba(0, 122, 255, 0.2);
	}

	.feature-icon {
		color: #007aff;
		margin-bottom: 16px;
	}

	.feature-title {
		color: #1d1d1f;
		font-size: 19px;
		font-weight: 600;
		margin: 0 0 8px 0;
		letter-spacing: -0.03em;
	}

	.feature-description {
		color: #86868b;
		font-size: 15px;
		margin: 0;
		line-height: 1.6;
		letter-spacing: -0.022em;
	}

	@media (max-width: 768px) {
		.header {
			padding: 60px 20px 48px;
		}

		.title {
			font-size: 40px;
		}

		.subtitle {
			font-size: 19px;
		}

		.results-grid {
			grid-template-columns: 1fr;
		}

		.coming-soon-section {
			padding: 60px 20px;
			margin-top: 60px;
		}

		.coming-soon-title {
			font-size: 32px;
		}

		.coming-soon-subtitle {
			font-size: 17px;
		}

		.features-grid {
			grid-template-columns: 1fr;
			gap: 16px;
		}
	}
</style>
