<script lang="ts">
	let { message, onRetry }: { message: string; onRetry?: () => void } = $props();
</script>

<div class="error">
	<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
		<circle cx="12" cy="12" r="10"></circle>
		<line x1="12" y1="8" x2="12" y2="12"></line>
		<line x1="12" y1="16" x2="12.01" y2="16"></line>
	</svg>
	<h3 class="title">Something went wrong</h3>
	<p class="message">{message}</p>
	{#if onRetry}
		<button onclick={onRetry} class="retry-button">
			Try Again
		</button>
	{/if}
</div>

<style>
	.error {
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
		margin: 0 0 24px 0;
		line-height: 1.47059;
		letter-spacing: -0.022em;
	}

	.retry-button {
		background: #007aff;
		color: white;
		border: none;
		padding: 12px 24px;
		border-radius: 10px;
		font-weight: 500;
		font-size: 15px;
		cursor: pointer;
		transition: all 0.2s ease;
		letter-spacing: -0.022em;
		font-family: inherit;
	}

	.retry-button:hover {
		background: #0051d5;
		box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
	}

	.retry-button:active {
		transform: scale(0.98);
	}
</style>
