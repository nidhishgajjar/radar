<script lang="ts">
	let { value = $bindable(''), onSearch }: { value: string; onSearch: (query: string) => void } = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (value.length >= 3) {
				onSearch(value);
			}
		}
	}
</script>

<div class="search-container">
	<div class="search-box">
		<svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="11" cy="11" r="8"></circle>
			<path d="m21 21-4.35-4.35"></path>
		</svg>
		<input
			type="search"
			bind:value
			onkeydown={handleKeydown}
			placeholder="Search, paste job URL, or enter job description..."
			class="search-input"
		/>
	</div>
</div>

<style>
	.search-container {
		width: 100%;
		max-width: 680px;
		margin: 0 auto 48px;
	}

	.search-box {
		position: relative;
		display: flex;
		align-items: center;
		background: #f5f5f7;
		border-radius: 12px;
		padding: 14px 20px;
		transition: all 0.25s ease;
		border: 1px solid transparent;
	}

	.search-box:focus-within {
		background: #ffffff;
		border-color: rgba(0, 122, 255, 0.4);
		box-shadow: 0 0 0 4px rgba(0, 122, 255, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
	}

	.search-icon {
		color: #86868b;
		flex-shrink: 0;
		margin-right: 12px;
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
	}

	.search-input::placeholder {
		color: #86868b;
	}

	@media (max-width: 640px) {
		.search-container {
			margin-bottom: 32px;
		}

		.search-box {
			padding: 12px 16px;
		}

		.search-input {
			font-size: 16px;
		}
	}
</style>
