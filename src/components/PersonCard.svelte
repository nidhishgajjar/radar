<script lang="ts">
	import type { SearchResult } from '$lib/types/exa';

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
				<div class="name-row">
					<h3 class="name">{name}</h3>
					{#if person.filterMetadata?.recentlyLeft}
						<span class="recently-left-chip">Recently Left</span>
					{/if}
				</div>
				{#if role}
					<p class="role">{role}</p>
				{/if}
				{#if person.companyData && (person.companyData.headcount || person.companyData.revenue)}
					<div class="company-stats">
						{#if person.companyData.headcount}
							<span class="stat">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
									<circle cx="9" cy="7" r="4"></circle>
									<path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
									<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
								</svg>
								{person.companyData.headcount.toLocaleString()}
							</span>
						{/if}
						{#if person.companyData.revenue}
							<span class="stat">
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
									<line x1="12" y1="1" x2="12" y2="23"></line>
									<path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
								</svg>
								{person.companyData.revenue}
							</span>
						{/if}
						{#if person.companyData.industry}
							<span class="stat industry">{person.companyData.industry}</span>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</button>
	<a
		href={person.url}
		target="_blank"
		rel="noopener noreferrer"
		class="linkedin-link"
		onclick={(e) => e.stopPropagation()}
		aria-label="View LinkedIn profile"
	>
		<svg class="linkedin-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#0077B5">
			<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
		</svg>
	</a>
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

	.name-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.recently-left-chip {
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		background: rgba(255, 149, 0, 0.1);
		color: #cc7700;
		font-size: 11px;
		font-weight: 500;
		border-radius: 4px;
		letter-spacing: -0.01em;
	}

	.name {
		color: #1d1d1f;
		font-size: 17px;
		font-weight: 600;
		margin: 0 0 4px 0;
		letter-spacing: -0.03em;
		line-height: 1.23529;
	}

	.role {
		color: #86868b;
		font-size: 15px;
		margin: 0;
		line-height: 1.47059;
		letter-spacing: -0.022em;
		font-weight: 400;
	}

	.company-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 8px;
	}

	.stat {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		background: #f5f5f7;
		color: #1d1d1f;
		font-size: 12px;
		font-weight: 500;
		border-radius: 4px;
	}

	.stat svg {
		color: #86868b;
	}

	.stat.industry {
		background: rgba(0, 122, 255, 0.08);
		color: #007aff;
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
