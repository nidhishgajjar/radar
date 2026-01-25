// Subscription store using Svelte 5 runes
export type SubscriptionTier = 'free' | 'premium';

interface SubscriptionState {
	tier: SubscriptionTier;
	showModal: boolean;
}

function createSubscriptionStore() {
	let state = $state<SubscriptionState>({
		tier: 'free', // Default to free tier
		showModal: false
	});

	return {
		get tier() {
			return state.tier;
		},
		get showModal() {
			return state.showModal;
		},
		get isPremium() {
			return state.tier === 'premium';
		},
		openModal() {
			state.showModal = true;
		},
		closeModal() {
			state.showModal = false;
		},
		upgrade() {
			state.tier = 'premium';
			state.showModal = false;
		},
		// For testing - allow downgrade
		downgrade() {
			state.tier = 'free';
		}
	};
}

export const subscription = createSubscriptionStore();
