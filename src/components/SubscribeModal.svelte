<script lang="ts">
	import { subscription } from '$lib/stores/subscription.svelte';

	interface Props {
		onClose: () => void;
	}

	let { onClose }: Props = $props();

	function handleClose() {
		subscription.closeModal();
		onClose();
	}

	function handleSubscribe() {
		// TODO: Integrate with actual payment system (Stripe, etc.)
		// For now, just upgrade to premium
		subscription.upgrade();
		alert('Welcome to Radar Premium! 🎉');
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			handleClose();
		}
	}
</script>

<div class="modal-backdrop" onclick={handleBackdropClick} role="dialog" aria-modal="true">
	<div class="modal-content">
		<button class="close-button" onclick={handleClose} aria-label="Close">
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="18" y1="6" x2="6" y2="18"></line>
				<line x1="6" y1="6" x2="18" y2="18"></line>
			</svg>
		</button>

		<div class="modal-header">
			<div class="premium-badge">Premium</div>
			<h2 class="modal-title">Unlock Full Access</h2>
			<p class="modal-subtitle">Get complete candidate profiles and unlimited searches</p>
		</div>

		<div class="features-list">
			<div class="feature-item">
				<svg class="check-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="20 6 9 17 4 12"></polyline>
				</svg>
				<span>Full candidate profiles with contact information</span>
			</div>
			<div class="feature-item">
				<svg class="check-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="20 6 9 17 4 12"></polyline>
				</svg>
				<span>Unlimited search results and pagination</span>
			</div>
			<div class="feature-item">
				<svg class="check-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="20 6 9 17 4 12"></polyline>
				</svg>
				<span>Email and phone contact details</span>
			</div>
			<div class="feature-item">
				<svg class="check-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="20 6 9 17 4 12"></polyline>
				</svg>
				<span>LinkedIn profiles and social links</span>
			</div>
			<div class="feature-item">
				<svg class="check-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="20 6 9 17 4 12"></polyline>
				</svg>
				<span>Advanced AI-powered candidate matching</span>
			</div>
		</div>

		<div class="pricing">
			<div class="price">$49<span class="period">/month</span></div>
			<p class="price-description">Billed monthly • Cancel anytime</p>
		</div>

		<button class="subscribe-button" onclick={handleSubscribe}>
			Subscribe Now
		</button>

		<p class="terms">By subscribing, you agree to our Terms of Service and Privacy Policy</p>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
		backdrop-filter: blur(4px);
	}

	.modal-content {
		background: white;
		border-radius: 16px;
		padding: 40px;
		max-width: 480px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		position: relative;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
	}

	.close-button {
		position: absolute;
		top: 16px;
		right: 16px;
		background: none;
		border: none;
		color: #86868b;
		cursor: pointer;
		padding: 8px;
		border-radius: 8px;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-button:hover {
		background: #f5f5f7;
		color: #1d1d1f;
	}

	.modal-header {
		text-align: center;
		margin-bottom: 32px;
	}

	.premium-badge {
		display: inline-block;
		background: linear-gradient(135deg, #007aff 0%, #0051d5 100%);
		color: white;
		padding: 6px 16px;
		border-radius: 20px;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-transform: uppercase;
		margin-bottom: 16px;
	}

	.modal-title {
		color: #1d1d1f;
		font-size: 32px;
		font-weight: 700;
		margin: 0 0 12px 0;
		letter-spacing: -0.04em;
	}

	.modal-subtitle {
		color: #86868b;
		font-size: 17px;
		margin: 0;
		letter-spacing: -0.022em;
	}

	.features-list {
		margin-bottom: 32px;
	}

	.feature-item {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 12px 0;
		color: #1d1d1f;
		font-size: 15px;
		line-height: 1.5;
		letter-spacing: -0.022em;
	}

	.check-icon {
		color: #007aff;
		flex-shrink: 0;
		margin-top: 2px;
	}

	.pricing {
		text-align: center;
		margin-bottom: 24px;
		padding: 24px;
		background: #f5f5f7;
		border-radius: 12px;
	}

	.price {
		color: #1d1d1f;
		font-size: 48px;
		font-weight: 700;
		letter-spacing: -0.04em;
		line-height: 1;
	}

	.period {
		font-size: 20px;
		font-weight: 500;
		color: #86868b;
		margin-left: 4px;
	}

	.price-description {
		color: #86868b;
		font-size: 14px;
		margin: 8px 0 0 0;
		letter-spacing: -0.022em;
	}

	.subscribe-button {
		width: 100%;
		background: linear-gradient(135deg, #007aff 0%, #0051d5 100%);
		color: white;
		border: none;
		padding: 16px 32px;
		border-radius: 12px;
		font-weight: 600;
		font-size: 17px;
		cursor: pointer;
		transition: all 0.2s ease;
		letter-spacing: -0.022em;
		font-family: inherit;
		box-shadow: 0 4px 12px rgba(0, 122, 255, 0.3);
	}

	.subscribe-button:hover {
		transform: translateY(-2px);
		box-shadow: 0 8px 20px rgba(0, 122, 255, 0.4);
	}

	.subscribe-button:active {
		transform: translateY(0);
	}

	.terms {
		text-align: center;
		color: #86868b;
		font-size: 12px;
		margin: 16px 0 0 0;
		line-height: 1.5;
		letter-spacing: -0.022em;
	}

	@media (max-width: 640px) {
		.modal-content {
			padding: 32px 24px;
		}

		.modal-title {
			font-size: 28px;
		}

		.price {
			font-size: 40px;
		}
	}
</style>
