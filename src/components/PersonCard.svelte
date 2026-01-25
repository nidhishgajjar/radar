<script lang="ts">
	import type { SearchResult } from '$lib/types/exa';
	import { subscription } from '$lib/stores/subscription.svelte';

	let { person, onClick }: { person: SearchResult; onClick: () => void } = $props();

	// Parse the title to extract name and role
	function parseTitle(title: string) {
		const parts = title.split('|').map(s => s.trim());
		if (parts.length >= 2) {
			return {
				name: parts[0],
				role: parts.slice(1).join(' | ')
			};
		}
		const atParts = title.split(' at ');
		if (atParts.length === 2) {
			return {
				name: atParts[0],
				role: 'at ' + atParts[1]
			};
		}
		return {
			name: title,
			role: null
		};
	}

	const { name, role } = parseTitle(person.title);

	// Extract first name only for free users
	const displayName = subscription.isPremium
		? name
		: name.split(' ')[0] + '.';

	function handleLinkedInClick(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		if (!subscription.isPremium) {
			subscription.openModal();
		} else {
			window.open(person.url, '_blank', 'noopener,noreferrer');
		}
	}
</script>

<div class="card">
	<button class="card-button" onclick={onClick}>
		<div class="card-content">
			<div class="profile-section">
				{#if person.image}
					<img src={person.image} alt={name} class="profile-image" />
				{:else}
					<div class="profile-image-placeholder">
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
							<circle cx="12" cy="7" r="4"></circle>
						</svg>
					</div>
				{/if}
			</div>
			<div class="text-content">
				<h3 class="name">
					{displayName}
					{#if !subscription.isPremium}
						<svg class="lock-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
							<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
						</svg>
					{/if}
				</h3>
				{#if role}
					<p class="role">{role}</p>
				{/if}
			</div>
		</div>
	</button>
	<button
		class="linkedin-link"
		onclick={handleLinkedInClick}
		aria-label={subscription.isPremium ? 'View LinkedIn profile' : 'Unlock LinkedIn profile'}
	>
		{#if subscription.isPremium}
			<svg class="linkedin-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#0077B5">
				<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
			</svg>
		{:else}
			<div class="locked-linkedin">
				<svg class="linkedin-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#0077B5">
					<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
				</svg>
				<svg class="small-lock-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
					<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
				</svg>
			</div>
		{/if}
	</button>
</div>

<style>
	.card {
		background: #ffffff;
		border: 1px solid rgba(0, 0, 0, 0.06);
		border-radius: 12px;
		padding: 20px;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		transition: all 0.2s ease;
	}

	.card:hover {
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
		border-color: rgba(0, 122, 255, 0.2);
	}

	.card-button {
		flex: 1;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
		font-family: inherit;
		min-width: 0;
	}

	.card-button:active {
		transform: scale(0.98);
	}

	.card-content {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}

	.profile-section {
		flex-shrink: 0;
	}

	.profile-image {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid rgba(0, 0, 0, 0.06);
	}

	.profile-image-placeholder {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: #f5f5f7;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid rgba(0, 0, 0, 0.06);
	}

	.profile-image-placeholder svg {
		color: #86868b;
	}

	.text-content {
		flex: 1;
		min-width: 0;
	}

	.name {
		color: #1d1d1f;
		font-size: 17px;
		font-weight: 600;
		margin: 0 0 4px 0;
		letter-spacing: -0.03em;
		line-height: 1.23529;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.lock-icon {
		color: #86868b;
		flex-shrink: 0;
	}

	.role {
		color: #86868b;
		font-size: 15px;
		margin: 0;
		line-height: 1.47059;
		letter-spacing: -0.022em;
		font-weight: 400;
	}

	.linkedin-link {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 8px;
		transition: all 0.2s ease;
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
	}

	.linkedin-link:hover {
		background: rgba(0, 119, 181, 0.1);
	}

	.linkedin-link:active {
		transform: scale(0.95);
	}

	.linkedin-icon {
		width: 24px;
		height: 24px;
		opacity: 0.7;
		transition: opacity 0.2s ease;
	}

	.linkedin-link:hover .linkedin-icon {
		opacity: 1;
	}

	.locked-linkedin {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.small-lock-icon {
		position: absolute;
		bottom: -2px;
		right: -2px;
		color: #007aff;
		background: white;
		border-radius: 50%;
		padding: 1px;
	}

	@media (max-width: 640px) {
		.card {
			padding: 16px;
		}

		.profile-image,
		.profile-image-placeholder {
			width: 40px;
			height: 40px;
		}

		.profile-image-placeholder svg {
			width: 20px;
			height: 20px;
		}

		.name {
			font-size: 16px;
		}

		.role {
			font-size: 14px;
		}

		.linkedin-icon {
			width: 20px;
			height: 20px;
		}
	}
</style>
