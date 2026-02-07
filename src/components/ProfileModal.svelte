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

	const fitScore = person.filterMetadata?.fitScore;
	const scoreClass = fitScore !== undefined && fitScore >= 70 ? 'high' : fitScore !== undefined && fitScore >= 40 ? 'mid' : 'low';
	const factors = person.filterMetadata?.matchingFactors || person.filterMetadata?.keyHighlights || [];

	// Get work history from entities
	const workHistory = person.entities?.[0]?.properties?.workHistory || [];
	const personLocation = person.entities?.[0]?.properties?.location;

	function formatHeadcount(n: number): string {
		return n.toLocaleString();
	}

	function formatDateRange(dates: { from?: string | null; to?: string | null } | null | undefined): string {
		if (!dates) return '';
		const from = dates.from || '';
		const to = dates.to || 'Present';
		if (!from && !to) return '';
		if (!from) return to;
		return `${from} – ${to}`;
	}
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
					<div class="header-badges">
						{#if fitScore !== undefined && fitScore > 0}
							<span class="score-badge {scoreClass}">Fit Score: {fitScore}</span>
						{/if}
						{#if person.filterMetadata?.recentlyLeft}
							<span class="recently-left-badge">Recently Left</span>
						{/if}
						{#if personLocation}
							<span class="location-badge">
								<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
								{personLocation}
							</span>
						{/if}
					</div>
				</div>
			</div>
			<a href={person.url} target="_blank" rel="noopener noreferrer" class="linkedin-header-link" aria-label="View LinkedIn profile">
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#0077B5">
					<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
				</svg>
			</a>
		</div>

		<div class="modal-body">
			<!-- AI Analysis Section -->
			{#if person.filterMetadata && (fitScore !== undefined && fitScore > 0 || person.filterMetadata.reasoning || factors.length > 0)}
				<div class="section-block">
					<h3 class="section-title">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
						AI Analysis
					</h3>
					<div class="ai-card">
						{#if fitScore !== undefined && fitScore > 0}
							<div class="score-bar-row">
								<span class="score-bar-label">Fit Score</span>
								<div class="score-bar-track">
									<div class="score-bar-fill {scoreClass}" style="width: {fitScore}%"></div>
								</div>
								<span class="score-bar-value {scoreClass}">{fitScore}</span>
							</div>
						{/if}
						{#if person.filterMetadata.reasoning}
							<p class="ai-reasoning">{person.filterMetadata.reasoning}</p>
						{/if}
						{#if factors.length > 0}
							<div class="factor-pills">
								{#each factors as factor}
									<span class="factor-pill">{factor}</span>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Current Company Section -->
			{#if person.companyData}
				<div class="section-block">
					<h3 class="section-title">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/></svg>
						Current Company
					</h3>
					<div class="company-card">
						<div class="company-card-header">
							{#if person.companyData.linkedinUrl}
								<a href={person.companyData.linkedinUrl} target="_blank" rel="noopener noreferrer" class="company-name-link">
									{person.companyData.name}
									<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
								</a>
							{:else}
								<span class="company-name-text">{person.companyData.name}</span>
							{/if}
						</div>
						<div class="company-meta-grid">
							{#if person.companyData.industry}
								<div class="company-meta-item">
									<div class="company-meta-label">Industry</div>
									<div class="company-meta-value">{person.companyData.industry}</div>
								</div>
							{/if}
							{#if person.companyData.headcountRange || person.companyData.headcount}
								<div class="company-meta-item">
									<div class="company-meta-label">Employees</div>
									<div class="company-meta-value">{person.companyData.headcountRange || formatHeadcount(person.companyData.headcount!)}</div>
								</div>
							{/if}
							{#if person.companyData.headquarters}
								<div class="company-meta-item">
									<div class="company-meta-label">Headquarters</div>
									<div class="company-meta-value">{person.companyData.headquarters}</div>
								</div>
							{/if}
							{#if person.companyData.founded}
								<div class="company-meta-item">
									<div class="company-meta-label">Founded</div>
									<div class="company-meta-value">{person.companyData.founded}</div>
								</div>
							{/if}
						</div>
						{#if person.companyData.description}
							<p class="company-description">{person.companyData.description}</p>
						{/if}
						{#if person.companyData.website}
							<a href={person.companyData.website.startsWith('http') ? person.companyData.website : `https://${person.companyData.website}`} target="_blank" rel="noopener noreferrer" class="company-website-link">
								{person.companyData.website.replace(/^https?:\/\//, '')}
								<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
							</a>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Work History Section -->
			{#if workHistory.length > 0}
				<div class="section-block">
					<h3 class="section-title">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
						Work History
					</h3>
					<div class="timeline">
						{#each workHistory as entry, i}
							<div class="timeline-entry">
								<div class="timeline-dot" class:current={i === 0} class:past={i > 0}></div>
								{#if entry.title}
									<div class="timeline-entry-title">{entry.title}</div>
								{/if}
								{#if entry.company?.name}
									{#if entry.company.id}
										<a href={entry.company.id} target="_blank" rel="noopener noreferrer" class="timeline-entry-company">{entry.company.name}</a>
									{:else}
										<span class="timeline-entry-company-text">{entry.company.name}</span>
									{/if}
								{/if}
								<div class="timeline-entry-meta">
									{#if entry.dates}
										<span>{formatDateRange(entry.dates)}</span>
									{/if}
									{#if entry.location}
										<span class="timeline-meta-sep">&middot;</span>
										<span>{entry.location}</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Profile URL -->
			{#if person.url}
				<div class="section-block">
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

			<!-- Key Highlights -->
			{#if person.highlights && person.highlights.length > 0}
				<div class="section-block">
					<h3 class="section-title">Key Highlights</h3>
					<ul class="highlights-list">
						{#each person.highlights as highlight}
							<li class="highlight-item">{highlight}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Full Profile -->
			{#if person.text}
				<div class="section-block">
					<h3 class="section-title">
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
						Full Profile
					</h3>
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
		margin: 0 0 4px 0;
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

	.header-badges {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
		flex-wrap: wrap;
	}

	.score-badge {
		padding: 4px 10px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 700;
	}

	.score-badge.high {
		background: rgba(52, 199, 89, 0.14);
		color: #1a7a34;
	}

	.score-badge.mid {
		background: rgba(255, 204, 0, 0.16);
		color: #8a6d00;
	}

	.score-badge.low {
		background: rgba(0, 0, 0, 0.05);
		color: #86868b;
	}

	.recently-left-badge {
		padding: 4px 10px;
		border-radius: 6px;
		background: rgba(255, 149, 0, 0.12);
		color: #cc7700;
		font-size: 12px;
		font-weight: 600;
	}

	.location-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border-radius: 6px;
		background: #f5f5f7;
		color: #86868b;
		font-size: 12px;
		font-weight: 500;
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

	.section-block {
		margin-bottom: 28px;
	}

	.section-title {
		color: #1d1d1f;
		font-size: 15px;
		font-weight: 600;
		margin: 0 0 12px 0;
		letter-spacing: -0.02em;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.section-title svg {
		color: #86868b;
	}

	/* AI Analysis */
	.ai-card {
		background: rgba(0, 122, 255, 0.03);
		border: 1px solid rgba(0, 122, 255, 0.1);
		border-radius: 12px;
		padding: 20px;
	}

	.score-bar-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
	}

	.score-bar-label {
		font-size: 13px;
		font-weight: 600;
		color: #86868b;
		min-width: 60px;
	}

	.score-bar-track {
		flex: 1;
		height: 8px;
		background: #e5e5ea;
		border-radius: 4px;
		overflow: hidden;
	}

	.score-bar-fill {
		height: 100%;
		border-radius: 4px;
		transition: width 0.6s ease;
	}

	.score-bar-fill.high {
		background: #34c759;
	}

	.score-bar-fill.mid {
		background: #ffcc00;
	}

	.score-bar-fill.low {
		background: #c7c7cc;
	}

	.score-bar-value {
		font-size: 14px;
		font-weight: 700;
		min-width: 32px;
	}

	.score-bar-value.high {
		color: #1a7a34;
	}

	.score-bar-value.mid {
		color: #8a6d00;
	}

	.score-bar-value.low {
		color: #86868b;
	}

	.ai-reasoning {
		font-size: 14px;
		color: #48484a;
		line-height: 1.55;
		letter-spacing: -0.01em;
		margin: 0 0 12px 0;
	}

	.factor-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.factor-pill {
		padding: 5px 12px;
		border-radius: 7px;
		background: rgba(0, 122, 255, 0.08);
		color: #0066d6;
		font-size: 12px;
		font-weight: 500;
	}

	/* Company Card */
	.company-card {
		background: #f9f9fb;
		border: 1px solid rgba(0, 0, 0, 0.05);
		border-radius: 12px;
		padding: 20px;
	}

	.company-card-header {
		margin-bottom: 14px;
	}

	.company-name-link {
		font-size: 18px;
		font-weight: 600;
		color: #007aff;
		text-decoration: none;
		letter-spacing: -0.02em;
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}

	.company-name-link:hover {
		text-decoration: underline;
	}

	.company-name-text {
		font-size: 18px;
		font-weight: 600;
		color: #1d1d1f;
		letter-spacing: -0.02em;
	}

	.company-meta-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 14px;
		margin-bottom: 14px;
	}

	.company-meta-label {
		font-size: 11px;
		color: #86868b;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		margin-bottom: 3px;
	}

	.company-meta-value {
		font-size: 15px;
		color: #1d1d1f;
		font-weight: 500;
		letter-spacing: -0.02em;
	}

	.company-description {
		font-size: 14px;
		color: #48484a;
		line-height: 1.55;
		margin: 0;
		padding-top: 12px;
		border-top: 1px solid rgba(0, 0, 0, 0.05);
	}

	.company-website-link {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: #007aff;
		font-size: 13px;
		text-decoration: none;
		margin-top: 10px;
	}

	.company-website-link:hover {
		text-decoration: underline;
	}

	/* Work History Timeline */
	.timeline {
		position: relative;
		padding-left: 24px;
	}

	.timeline::before {
		content: '';
		position: absolute;
		left: 7px;
		top: 4px;
		bottom: 4px;
		width: 2px;
		background: #e5e5ea;
		border-radius: 1px;
	}

	.timeline-entry {
		position: relative;
		padding-bottom: 20px;
	}

	.timeline-entry:last-child {
		padding-bottom: 0;
	}

	.timeline-dot {
		position: absolute;
		left: -20px;
		top: 5px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid #fff;
		box-shadow: 0 0 0 2px #e5e5ea;
	}

	.timeline-dot.current {
		background: #007aff;
	}

	.timeline-dot.past {
		background: #c7c7cc;
	}

	.timeline-entry-title {
		font-size: 15px;
		font-weight: 600;
		color: #1d1d1f;
		letter-spacing: -0.02em;
		line-height: 1.3;
	}

	.timeline-entry-company {
		font-size: 14px;
		color: #007aff;
		margin-top: 2px;
		text-decoration: none;
		display: inline-block;
	}

	.timeline-entry-company:hover {
		text-decoration: underline;
	}

	.timeline-entry-company-text {
		font-size: 14px;
		color: #48484a;
		margin-top: 2px;
		display: inline-block;
	}

	.timeline-entry-meta {
		font-size: 12px;
		color: #86868b;
		margin-top: 3px;
		display: flex;
		gap: 6px;
		align-items: center;
	}

	.timeline-meta-sep {
		color: #c7c7cc;
	}

	/* Profile URL */
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

	/* Highlights */
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

		.company-meta-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
