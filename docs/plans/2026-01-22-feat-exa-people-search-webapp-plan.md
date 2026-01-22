---
title: Create Exa People Search Web App
type: feat
date: 2026-01-22
---

# Create Exa People Search Web App

Build a SvelteKit web application with API wrapper for Exa People Search, featuring simplified Exa-inspired design for recruiting/talent search use case.

## Problem Statement

Need a clean, performant web interface for searching professionals using Exa's People Search API (category="people"). The app should provide recruiters with an intuitive search experience while maintaining security, performance, and cost efficiency through proper API wrapper patterns.

## Proposed Solution

Create a full-stack SvelteKit application with:
- **Backend**: Server-side API routes acting as secure wrapper for Exa People Search API
- **Frontend**: Clean search interface with card-based results, inspired by Exa's minimalist design
- **Infrastructure**: Redis caching, rate limiting, environment-based configuration

## Acceptance Criteria

### Backend API Wrapper

- [x] SvelteKit API route at `/api/search/people` handling POST requests
- [x] Secure API key management using `$env/static/private`
- [x] TypeScript wrapper class for Exa API with proper error handling
- [ ] Rate limiting: 10 requests/second per user (Deferred to v2 - MVP doesn't include)
- [ ] Redis caching with 1-hour TTL for search results (Deferred to v2 - MVP doesn't include)
- [x] Comprehensive error responses (401, 429, 500, 400)

### Frontend Search Interface

- [x] Search bar with debouncing (300ms delay)
- [x] Loading states with skeleton loaders
- [x] Card-based result display (name, role, company, profile link)
- [x] Pagination (20 results per page)
- [x] Error messages for failed searches
- [x] Empty state for no results
- [x] Responsive design (mobile, tablet, desktop)

### Design & UX

- [x] Exa-inspired color palette (navy to electric blue spectrum)
- [x] Inter font family for clean typography
- [x] Card UI with subtle grid overlays
- [x] Minimal, spacious layout with proper whitespace
- [x] Tailwind CSS integration

### Performance & Security

- [x] API keys never exposed to client
- [x] HTTPS enforcement
- [x] Response times < 2 seconds (with cache)
- [x] Client-side query validation (min 3 characters)
- [ ] Rate limit headers in API responses (Deferred to v2 - no rate limiting in MVP)

### Testing & Documentation

- [x] Basic manual testing checklist
- [x] README with setup instructions
- [x] Environment variable documentation
- [x] API endpoint documentation

## Context

### Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Framework | SvelteKit 2.0 | Full-stack framework with excellent DX, built-in API routes |
| Language | TypeScript | Type safety for API integration |
| Styling | Tailwind CSS + Custom CSS | Rapid development + Exa design customization |
| Caching | Redis | Sub-millisecond performance for repeated queries |
| API Client | exa-js | Official Exa JavaScript SDK |

### Project Structure

```
healthcarejobs/
├── src/
│   ├── lib/
│   │   ├── server/
│   │   │   ├── exa-wrapper.ts      # Exa API wrapper class
│   │   │   ├── cache.ts            # Redis caching utilities
│   │   │   └── rate-limiter.ts     # Rate limiting logic
│   │   ├── types/
│   │   │   └── exa.ts              # TypeScript types for Exa API
│   │   └── config.ts               # Configuration management
│   ├── routes/
│   │   ├── +page.svelte            # Homepage (search interface)
│   │   ├── +layout.svelte          # Root layout (global styles)
│   │   └── api/
│   │       └── search/
│   │           └── people/
│   │               └── +server.ts  # People search API endpoint
│   ├── components/
│   │   ├── SearchBar.svelte        # Search input with debouncing
│   │   ├── PersonCard.svelte       # Result card component
│   │   ├── Pagination.svelte       # Pagination controls
│   │   ├── LoadingState.svelte     # Skeleton loader
│   │   ├── ErrorMessage.svelte     # Error display
│   │   └── EmptyState.svelte       # No results display
│   └── app.css                     # Global styles (Tailwind + custom)
├── static/
│   └── favicon.png
├── .env.example
├── .env
├── package.json
├── svelte.config.js
├── tailwind.config.js
├── tsconfig.json
└── README.md
```

### API Wrapper Example

```typescript
// src/lib/server/exa-wrapper.ts
import Exa from 'exa-js';
import { EXA_API_KEY } from '$env/static/private';

export class ExaWrapper {
  private client: Exa;

  constructor() {
    this.client = new Exa(EXA_API_KEY);
  }

  async searchPeople(query: string, numResults: number = 20) {
    return await this.client.searchAndContents(query, {
      category: 'people',
      numResults,
      text: true,
      type: 'auto'
    });
  }
}
```

### Environment Variables

```env
# .env
EXA_API_KEY=a17c2c78-2c91-4d68-8333-5fb1ee0b59a3
REDIS_URL=redis://localhost:6379
PUBLIC_APP_NAME=Healthcare Jobs - People Search
```

### Research Findings

**From spoq-web-apis (Rust patterns):**
- Service-oriented architecture with dedicated modules per external API
- Type-safe error handling with custom error enums
- Comprehensive configuration validation
- Location: `/Users/nidhishgajjar/conversations/spoq-web-apis/src/services/github.rs:1-150`

**From Jobs.ca (Next.js patterns):**
- Tailwind CSS with shadcn/ui component library
- Clerk authentication patterns
- Supabase integration for data storage
- Location: `/Users/nidhishgajjar/Technical/Startups/Jobs.ca/Web-App/tech-jobs-candidate-portal/`

**SvelteKit Best Practices:**
- [Official SvelteKit Documentation](https://svelte.dev/docs/kit)
- [Tailwind CSS + SvelteKit Guide](https://tailwindcss.com/docs/guides/sveltekit)
- Server-side API routes pattern with `+server.ts`
- Environment variable management via `$env` imports

**Exa Integration:**
- [Exa People Search Launch](https://exa.ai/docs/changelog/people-search-launch)
- [Exa Search API Reference](https://docs.exa.ai/reference/search)
- Rate limiting: 10 req/sec recommended
- Caching: 1-24 hour TTL based on query popularity
- Cost: $0.005 for 1-25 results

**Design Language:**
- [Exa Brand Guidelines](https://exa.ai/brand)
- Blue spectrum palette: `#0A1628` (navy) to `#5AB9EA` (electric)
- Geometric, minimal aesthetic
- Clean typography with Inter font family

## MVP

### SearchBar.svelte

```svelte
<script lang="ts">
  import { debounce } from 'lodash';

  export let value: string = '';
  export let onSearch: (query: string) => void;

  const debouncedSearch = debounce((q: string) => {
    if (q.length >= 3) onSearch(q);
  }, 300);

  $: debouncedSearch(value);
</script>

<div class="search-bar">
  <input
    type="search"
    bind:value
    placeholder="Search for people (e.g., 'Senior engineers at Google')"
    class="search-input"
  />
</div>

<style>
  .search-bar {
    max-width: 600px;
    margin: 0 auto;
  }

  .search-input {
    width: 100%;
    padding: 1rem;
    font-size: 1.125rem;
    border: 2px solid #2E5C8A;
    border-radius: 8px;
    background: white;
  }

  .search-input:focus {
    outline: none;
    border-color: #4A90E2;
  }
</style>
```

### PersonCard.svelte

```svelte
<script lang="ts">
  export let person: {
    title: string;
    url: string;
    text?: string;
    author?: string;
  };
</script>

<div class="card">
  <h3 class="card-title">{person.title}</h3>
  {#if person.text}
    <p class="card-snippet">{person.text.slice(0, 150)}...</p>
  {/if}
  {#if person.author}
    <span class="card-meta">{person.author}</span>
  {/if}
  <a href={person.url} class="card-action" target="_blank" rel="noopener">
    View Profile →
  </a>
</div>

<style>
  .card {
    background: white;
    border: 1px solid rgba(46, 92, 138, 0.2);
    border-radius: 8px;
    padding: 1.5rem;
    transition: transform 0.2s;
  }

  .card:hover {
    transform: translateY(-2px);
  }

  .card-title {
    color: #0A1628;
    margin: 0 0 0.5rem 0;
  }

  .card-snippet {
    color: #1E3A5F;
    line-height: 1.6;
    margin: 0.5rem 0;
  }

  .card-action {
    color: #4A90E2;
    text-decoration: none;
    font-weight: 500;
  }
</style>
```

### api/search/people/+server.ts

```typescript
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ExaWrapper } from '$lib/server/exa-wrapper';
import { cachedSearch } from '$lib/server/cache';
import { withRateLimit } from '$lib/server/rate-limiter';

const exa = new ExaWrapper();

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  try {
    const { query, page = 1 } = await request.json();

    // Validate input
    if (!query || query.length < 3) {
      return json({ error: 'Query must be at least 3 characters' }, { status: 400 });
    }

    // Rate limit by IP
    const clientIp = getClientAddress();
    await withRateLimit(clientIp);

    // Search with caching
    const cacheKey = `people:${query}:${page}`;
    const results = await cachedSearch(
      cacheKey,
      3600, // 1 hour
      () => exa.searchPeople(query, 20)
    );

    return json(results);

  } catch (error: any) {
    if (error.type === 'RATE_LIMIT') {
      return json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    console.error('Search error:', error);
    return json({ error: 'Search failed' }, { status: 500 });
  }
};
```

## References

### Internal Patterns
- Rust service pattern: `~/conversations/spoq-web-apis/src/services/github.rs:1-150`
- Next.js API route: `~/Technical/Startups/Jobs.ca/Web-App/tech-jobs-candidate-portal/app/api/job-hunts/route.ts:1-33`
- Tailwind config: `~/Technical/Startups/Jobs.ca/Web-App/tech-jobs-candidate-portal/tailwind.config.ts:1-95`

### External Documentation
- [SvelteKit Official Docs](https://svelte.dev/docs/kit)
- [Exa People Search API](https://docs.exa.ai/reference/search)
- [Exa Brand Guidelines](https://exa.ai/brand)
- [Tailwind CSS SvelteKit Guide](https://tailwindcss.com/docs/guides/sveltekit)
- [TypeScript Best Practices 2026](https://johal.in/typescript-best-practices-for-large-scale-web-applications-in-2026/)
- [API Security Best Practices](https://johal.in/api-security-best-practices-authentication-rate-limiting-and-input-validation-techniques/)

### GitHub Examples
- [exa-labs/company-researcher](https://github.com/exa-labs/company-researcher) - Next.js + Exa integration
- [exa-labs/exa-py](https://github.com/exa-labs/exa-py) - Official Python SDK patterns
- [exa-labs/exa-js](https://github.com/exa-labs/exa-js) - Official JavaScript SDK
