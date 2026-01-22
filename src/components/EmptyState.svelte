<script lang="ts">
	let { query }: { query: string } = $props();
</script>

<div class="empty">
	<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
		<circle cx="11" cy="11" r="8"></circle>
		<path d="m21 21-4.35-4.35"></path>
	</svg>
	<h3 class="title">No results found</h3>
	<p class="message">
		{#if query}
			No profiles found for <strong>"{query}"</strong>
		{:else}
			Start searching to find people
		{/if}
	</p>
	<p class="hint">Try different keywords or broaden your search</p>
</div>

<style>
	.empty {
		text-align: center;
		padding: 80px 20px;
		max-width: 500px;
		margin: 0 auto;
	}

	.icon {
		color: #d2d2d7;
		margin-bottom: 24px;
	}

	.title {
		color: #1d1d1f;
		font-size: 24px;
		font-weight: 600;
		margin: 0 0 12px 0;
		letter-spacing: -0.03em;
	}

	.message {
		color: #86868b;
		font-size: 17px;
		margin: 0 0 8px 0;
		line-height: 1.47059;
		letter-spacing: -0.022em;
	}

	.message strong {
		color: #1d1d1f;
		font-weight: 500;
	}

	.hint {
		color: #86868b;
		font-size: 15px;
		letter-spacing: -0.022em;
		margin: 0;
	}
</style>
