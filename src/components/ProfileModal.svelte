<script lang="ts">
	import type { SearchResult } from '$lib/types/exa';
	import { renderMarkdown } from '$lib/utils/markdown';

	let { person, onClose }: { person: SearchResult; onClose: () => void } = $props();

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onClose();
		}
	}

	function handleEscape(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	// Parse title
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

<svelte:window onkeydown={handleEscape} />

<div class="modal-backdrop" onclick={handleBackdropClick}>
	<div class="modal-content">
		<button class="close-button" onclick={onClose} aria-label="Close">
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<line x1="18" y1="6" x2="6" y2="18"></line>
				<line x1="6" y1="6" x2="18" y2="18"></line>
			</svg>
		</button>

		<div class="modal-header">
			<div class="header-content">
				<div class="profile-image-section">
					{#if person.image}
						<img src={person.image} alt={name} class="profile-modal-image" />
					{:else}
						<div class="profile-modal-placeholder">
							<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
								<circle cx="12" cy="7" r="4"></circle>
							</svg>
						</div>
					{/if}
				</div>
				<div class="header-text">
					<h2 class="modal-title">{name}</h2>
					{#if role}
						<p class="modal-role">{role}</p>
					{/if}
				</div>
			</div>
			<a href={person.url} target="_blank" rel="noopener noreferrer" class="linkedin-header-link" aria-label="View LinkedIn profile">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#0077B5">
					<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
				</svg>
			</a>
		</div>

		<div class="modal-body">
			{#if person.url}
				<div class="info-section">
					<h3 class="section-title">Profile</h3>
					<a href={person.url} target="_blank" rel="noopener noreferrer" class="profile-url">
						{person.url}
						<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
							<polyline points="15 3 21 3 21 9"></polyline>
							<line x1="10" y1="14" x2="21" y2="3"></line>
						</svg>
					</a>
				</div>
			{/if}

			{#if person.highlights && person.highlights.length > 0}
				<div class="highlights-section">
					<h3 class="section-title">Key Highlights</h3>
					<ul class="highlights-list">
						{#each person.highlights as highlight}
							<li class="highlight-item">{highlight}</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if person.text}
				<div class="profile-content">
					<h3 class="section-title">Full Profile</h3>
					<div class="markdown">
						{@html renderMarkdown(person.text)}
					</div>
				</div>
			{/if}

			<div class="modal-footer">
				<a href={person.url} target="_blank" rel="noopener noreferrer" class="linkedin-button">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
					</svg>
					View LinkedIn Profile
				</a>
			</div>
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
		overflow-y: auto;
	}

	.modal-content {
		background: #ffffff;
		border-radius: 16px;
		max-width: 720px;
		width: 100%;
		max-height: calc(100vh - 40px);
		overflow-y: auto;
		position: relative;
		box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
		animation: modalSlide 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
	}

	@keyframes modalSlide {
		from {
			opacity: 0;
			transform: translateY(20px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.close-button {
		position: absolute;
		top: 20px;
		right: 20px;
		background: rgba(0, 0, 0, 0.04);
		border: none;
		border-radius: 50%;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: #86868b;
		transition: all 0.2s ease;
		z-index: 10;
	}

	.close-button:hover {
		background: rgba(0, 0, 0, 0.08);
		color: #1d1d1f;
	}

	.modal-header {
		padding: 32px 40px;
		border-bottom: 1px solid rgba(0, 0, 0, 0.06);
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	.header-content {
		flex: 1;
		display: flex;
		align-items: flex-start;
		gap: 20px;
	}

	.profile-image-section {
		flex-shrink: 0;
	}

	.profile-modal-image {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid rgba(0, 0, 0, 0.06);
	}

	.profile-modal-placeholder {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: #f5f5f7;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px solid rgba(0, 0, 0, 0.06);
	}

	.profile-modal-placeholder svg {
		color: #86868b;
	}

	.header-text {
		flex: 1;
		min-width: 0;
	}

	.modal-title {
		color: #1d1d1f;
		font-size: 28px;
		font-weight: 700;
		margin: 0 0 6px 0;
		line-height: 1.2;
		letter-spacing: -0.04em;
	}

	.modal-role {
		color: #007aff;
		font-size: 17px;
		margin: 0;
		line-height: 1.47059;
		letter-spacing: -0.022em;
		font-weight: 400;
	}

	.linkedin-header-link {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		transition: all 0.2s ease;
	}

	.linkedin-header-link:hover {
		background: rgba(0, 119, 181, 0.1);
	}

	.linkedin-header-link:active {
		transform: scale(0.95);
	}

	.modal-body {
		padding: 32px 40px 40px;
	}

	.info-section {
		margin-bottom: 28px;
	}

	.profile-url {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: #007aff;
		font-size: 15px;
		text-decoration: none;
		transition: opacity 0.2s ease;
		word-break: break-all;
	}

	.profile-url:hover {
		opacity: 0.7;
	}

	.profile-url svg {
		flex-shrink: 0;
	}

	.profile-content {
		margin-top: 28px;
	}

	.highlights-section {
		margin-top: 28px;
	}

	.section-title {
		color: #1d1d1f;
		font-size: 17px;
		font-weight: 600;
		margin: 0 0 12px 0;
		letter-spacing: -0.03em;
	}

	.highlights-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.highlight-item {
		color: #1d1d1f;
		padding: 14px 18px;
		background: #f5f5f7;
		border-radius: 10px;
		line-height: 1.6;
		font-size: 15px;
		letter-spacing: -0.022em;
	}

	.company-section {
		margin-top: 28px;
		padding: 20px;
		background: linear-gradient(135deg, rgba(0, 122, 255, 0.04) 0%, rgba(0, 122, 255, 0.08) 100%);
		border-radius: 12px;
		border: 1px solid rgba(0, 122, 255, 0.1);
	}

	.company-section .section-title {
		color: #007aff;
		margin-bottom: 16px;
	}

	.company-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 16px;
	}

	.company-stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.stat-label {
		font-size: 12px;
		color: #86868b;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.stat-value {
		font-size: 16px;
		color: #1d1d1f;
		font-weight: 600;
		letter-spacing: -0.02em;
	}

	.company-website {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: #007aff;
		font-size: 14px;
		text-decoration: none;
		margin-top: 16px;
		transition: opacity 0.2s ease;
	}

	.company-website:hover {
		opacity: 0.7;
	}

	.modal-footer {
		margin-top: 32px;
		padding-top: 24px;
		border-top: 1px solid rgba(0, 0, 0, 0.06);
	}

	.linkedin-button {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		background: #0077B5;
		color: white;
		text-decoration: none;
		padding: 14px 28px;
		border-radius: 10px;
		font-weight: 500;
		font-size: 15px;
		transition: all 0.2s ease;
		letter-spacing: -0.022em;
	}

	.linkedin-button:hover {
		background: #006396;
		box-shadow: 0 4px 12px rgba(0, 119, 181, 0.3);
	}

	.linkedin-button:active {
		transform: scale(0.98);
	}

	@media (max-width: 768px) {
		.modal-content {
			border-radius: 16px 16px 0 0;
			max-height: calc(100vh - 20px);
		}

		.modal-header {
			padding: 32px 24px 20px;
		}

		.modal-title {
			font-size: 28px;
			margin-right: 32px;
		}

		.modal-role {
			font-size: 15px;
		}

		.modal-body {
			padding: 24px;
		}

		.close-button {
			top: 16px;
			right: 16px;
		}
	}
</style>
