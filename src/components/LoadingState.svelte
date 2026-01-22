<div class="loading">
	<div class="dots-container">
		<div class="dot"></div>
		<div class="dot"></div>
		<div class="dot"></div>
		<div class="dot"></div>
		<div class="dot"></div>
	</div>
	<p class="loading-text">Analyzing your search</p>
</div>

<style>
	.loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 80px 20px;
	}

	.dots-container {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		height: 40px;
	}

	.dot {
		width: 10px;
		height: 10px;
		background: #007aff;
		border-radius: 50%;
		animation: pulse 1.8s ease-in-out infinite;
	}

	.dot:nth-child(1) {
		animation-delay: 0s;
	}

	.dot:nth-child(2) {
		animation-delay: 0.15s;
	}

	.dot:nth-child(3) {
		animation-delay: 0.3s;
	}

	.dot:nth-child(4) {
		animation-delay: 0.45s;
	}

	.dot:nth-child(5) {
		animation-delay: 0.6s;
	}

	@keyframes pulse {
		0%, 100% {
			transform: scale(0.5);
			opacity: 0.3;
		}
		50% {
			transform: scale(1.2);
			opacity: 1;
		}
	}

	.loading-text {
		margin-top: 24px;
		color: #86868b;
		font-size: 17px;
		letter-spacing: -0.022em;
	}
</style>
