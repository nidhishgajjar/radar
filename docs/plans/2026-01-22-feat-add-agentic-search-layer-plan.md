---
title: Add Agentic Search Layer with Grok Fast
type: feat
date: 2026-01-22
---

# Add Agentic Search Layer with Grok Fast

## Overview

Transform Radar's search experience from basic keyword matching to intelligent, agentic search powered by xAI's Grok Fast model via OpenRouter. When users enter natural language queries like "nurses in Hamilton with verified licenses," the system will use LLM-powered query refinement to generate optimized search strings before querying the Exa People API, resulting in more relevant and comprehensive results.

**Context**: Radar by jobs.ca is a talent intelligence platform for employers. Currently uses direct Exa People Search API integration. This feature adds an LLM layer between user input and search execution to intelligently refine queries, similar to Exa's own agentic search product (Websets).

## Problem Statement

**Current Limitations**:
1. **Literal Query Matching**: User query "nurses in Hamilton with verified licenses" searches verbatim, missing semantic variations
2. **No Query Optimization**: Doesn't expand or refine queries based on search domain knowledge
3. **Single Search Path**: No multi-angle exploration of the talent pool
4. **Manual Query Crafting**: Users must know exact keywords to find candidates

**Impact**:
- Suboptimal search results quality
- Users miss relevant candidates due to keyword mismatches
- Competitive disadvantage vs. platforms with intelligent search
- Lower user satisfaction and retention

## Proposed Solution

Add an agentic search orchestration layer that:

1. **Query Refinement**: Use Grok 4.1 Fast to transform natural language into optimized search queries
2. **Semantic Understanding**: Extract entities (roles, skills, companies, locations) from user intent
3. **Fallback Resilience**: Gracefully degrade to original query if LLM fails
4. **Cost-Efficient**: Cache refined queries, use Grok Fast ($0.20/$0.50 per million tokens)
5. **Transparent**: Show users refined queries for trust and control

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         User Input                          │
│              "nurses in Hamilton with RN license"           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Input Validation                          │
│  • Min 3 chars  • Max 500 chars  • No injection patterns   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Query Refinement Service                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Cache Check (Map<string, CachedQuery>)             │  │
│  │  • TTL: 1 hour  • Hit rate target: 30%+             │  │
│  └───────────────────────┬──────────────────────────────┘  │
│                          │ (cache miss)                     │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Circuit Breaker (5 failures, 60s timeout)          │  │
│  │  State: CLOSED | OPEN | HALF_OPEN                   │  │
│  └───────────────────────┬──────────────────────────────┘  │
│                          │                                  │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  OpenRouter API Call                                 │  │
│  │  Model: x-ai/grok-4.1-fast                          │  │
│  │  Temp: 0.2  Max tokens: 100  Timeout: 5s           │  │
│  └───────────────────────┬──────────────────────────────┘  │
│                          │                                  │
│                    Success │ Failure                        │
│                          │                                  │
│             ┌────────────┴────────────┐                     │
│             │                         │                     │
│             ▼                         ▼                     │
│  ┌─────────────────┐      ┌──────────────────┐            │
│  │  Parse & Validate│      │  Fallback Logic  │            │
│  │  LLM Response   │      │  Use Original    │            │
│  └─────────┬────────┘      └────────┬─────────┘            │
│            │                        │                       │
│            └────────────┬───────────┘                       │
│                         │                                   │
│                         ▼                                   │
│              ┌──────────────────────┐                       │
│              │  Refined Query       │                       │
│              │  + Metadata          │                       │
│              └──────────┬───────────┘                       │
└─────────────────────────┼───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                Exa People Search API                        │
│  • Category: "people"  • Type: "auto"  • Results: 20       │
│  • UserLocation: "ca"  • IncludeDomains: ["linkedin.com"]  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Result Processing & Deduplication              │
│  • Remove duplicate URLs  • Score-based ranking             │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Response to Client                       │
│  {                                                          │
│    original_query: "...",                                   │
│    refined_query: "...",                                    │
│    results: [...],                                          │
│    metadata: { llm_used, refinement_time_ms, ... }         │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Phases

#### Phase 1: OpenRouter Client Infrastructure

**Objective**: Set up secure, production-ready OpenRouter API integration

**Tasks**:
1. Add environment variables to `.env`:
   ```env
   # Existing
   EXA_API_KEY=a17c2c78-2c91-4d68-8333-5fb1ee0b59a3
   PUBLIC_APP_NAME=Healthcare Jobs - People Search

   # New - OpenRouter Integration
   OPENROUTER_API_KEY=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
   OPENROUTER_MODEL=x-ai/grok-4.1-fast
   OPENROUTER_TIMEOUT_MS=5000
   QUERY_REFINEMENT_ENABLED=true
   ```

2. Update `.env.example` with documented variables
3. Create TypeScript types in `src/lib/types/openrouter.ts`:
   ```typescript
   export interface OpenRouterRequest {
     model: string;
     messages: Array<{
       role: 'system' | 'user' | 'assistant';
       content: string;
     }>;
     temperature?: number;
     max_tokens?: number;
     top_p?: number;
     frequency_penalty?: number;
     presence_penalty?: number;
   }

   export interface OpenRouterResponse {
     id: string;
     choices: Array<{
       index: number;
       message: {
         role: string;
         content: string;
       };
       finish_reason: string;
     }>;
     usage: {
       prompt_tokens: number;
       completion_tokens: number;
       total_tokens: number;
     };
     model: string;
   }

   export enum OpenRouterErrorType {
     AUTHENTICATION = 'AUTHENTICATION',
     RATE_LIMIT = 'RATE_LIMIT',
     MODEL_OVERLOADED = 'MODEL_OVERLOADED',
     INVALID_PROMPT = 'INVALID_PROMPT',
     TIMEOUT = 'TIMEOUT',
     NETWORK = 'NETWORK',
     SERVER_ERROR = 'SERVER_ERROR'
   }

   export class OpenRouterError extends Error {
     constructor(
       public type: OpenRouterErrorType,
       public statusCode?: number,
       message?: string
     ) {
       super(message);
       this.name = 'OpenRouterError';
     }
   }
   ```

4. Implement `OpenRouterClient` class in `src/lib/server/openrouter-client.ts`:
   - Follow existing `ExaWrapper` pattern
   - Constructor validates API key presence
   - `refineQuery()` method for single query refinement
   - `handleError()` private method for error classification
   - Request timeout configuration (5s default)
   - Exponential backoff retry logic (3 attempts)

**Success Criteria**:
- [ ] OpenRouter client can successfully authenticate
- [ ] Error types properly discriminated (401, 429, 503, timeout)
- [ ] Retry logic tested with mock failures
- [ ] Environment variables documented and validated
- [ ] TypeScript compilation passes with no errors

**Estimated Effort**: 4-6 hours

---

#### Phase 2: Circuit Breaker & Resilience

**Objective**: Prevent cascading failures when OpenRouter is unavailable

**Tasks**:
1. Create `CircuitBreaker` utility class in `src/lib/server/circuit-breaker.ts`:
   ```typescript
   export class CircuitBreaker {
     private failures = 0;
     private lastFailTime = 0;
     private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

     constructor(
       private threshold = 5,      // Open after 5 failures
       private timeout = 60000     // Reset after 60 seconds
     ) {}

     async execute<T>(operation: () => Promise<T>): Promise<T> {
       if (this.state === 'OPEN') {
         if (Date.now() - this.lastFailTime > this.timeout) {
           this.state = 'HALF_OPEN';
         } else {
           throw new CircuitBreakerOpenError('Circuit breaker is OPEN');
         }
       }

       try {
         const result = await operation();
         this.onSuccess();
         return result;
       } catch (error) {
         this.onFailure();
         throw error;
       }
     }

     private onSuccess() {
       this.failures = 0;
       this.state = 'CLOSED';
     }

     private onFailure() {
       this.failures++;
       this.lastFailTime = Date.now();

       if (this.failures >= this.threshold) {
         this.state = 'OPEN';
         console.warn(`Circuit breaker OPEN after ${this.failures} failures`);
       }
     }

     getState() {
       return {
         state: this.state,
         failures: this.failures,
         lastFailTime: this.lastFailTime
       };
     }
   }
   ```

2. Integrate circuit breaker into `OpenRouterClient`:
   ```typescript
   private circuitBreaker = new CircuitBreaker(5, 60000);

   async refineQuery(query: string): Promise<string> {
     return this.circuitBreaker.execute(() => this.callOpenRouterAPI(query));
   }
   ```

3. Add circuit breaker state monitoring endpoint (`/api/health/circuit-breaker`)
4. Write unit tests for state transitions (CLOSED → OPEN → HALF_OPEN → CLOSED)

**Success Criteria**:
- [ ] Circuit breaker opens after 5 consecutive failures
- [ ] Circuit breaker transitions to HALF_OPEN after timeout
- [ ] Successful request in HALF_OPEN state closes circuit
- [ ] Failed request in HALF_OPEN state reopens circuit
- [ ] State can be monitored via health endpoint

**Estimated Effort**: 3-4 hours

---

#### Phase 3: Query Refinement Service

**Objective**: Orchestrate query refinement with caching and fallback strategies

**Tasks**:
1. Create `AgenticSearchService` class in `src/lib/server/agentic-search.ts`:
   ```typescript
   interface RefinedQuery {
     original: string;
     refined: string;
     llm_used: boolean;
     refinement_time_ms: number;
     cached: boolean;
   }

   export class AgenticSearchService {
     private openRouter: OpenRouterClient;
     private exa: ExaWrapper;
     private queryCache: Map<string, { query: string; timestamp: number }>;
     private readonly CACHE_TTL = 3600000; // 1 hour

     constructor() {
       this.openRouter = new OpenRouterClient();
       this.exa = new ExaWrapper();
       this.queryCache = new Map();
     }

     async refineQuery(userQuery: string): Promise<RefinedQuery> {
       const startTime = Date.now();
       const cacheKey = userQuery.toLowerCase().trim();

       // Check cache first
       const cached = this.queryCache.get(cacheKey);
       if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
         return {
           original: userQuery,
           refined: cached.query,
           llm_used: true,
           refinement_time_ms: Date.now() - startTime,
           cached: true
         };
       }

       // Attempt LLM refinement with fallback
       let refined = userQuery;
       let llm_used = false;

       try {
         refined = await this.openRouter.refineQuery(userQuery);
         llm_used = true;

         // Validate LLM output
         if (!this.isValidQuery(refined)) {
           console.warn('LLM produced invalid query, using original');
           refined = userQuery;
           llm_used = false;
         } else {
           // Cache successful refinement
           this.queryCache.set(cacheKey, {
             query: refined,
             timestamp: Date.now()
           });
         }
       } catch (error) {
         console.warn('Query refinement failed, using original query', error);
         // Fallback to original query
       }

       return {
         original: userQuery,
         refined,
         llm_used,
         refinement_time_ms: Date.now() - startTime,
         cached: false
       };
     }

     async search(userQuery: string): Promise<AgenticSearchResponse> {
       // Refine query
       const refinement = await this.refineQuery(userQuery);

       // Execute Exa search with refined query
       const searchStart = Date.now();
       const results = await this.exa.searchPeople(refinement.refined, 20);

       return {
         original_query: refinement.original,
         refined_query: refinement.refined,
         results: results.results,
         metadata: {
           llm_used: refinement.llm_used,
           cached: refinement.cached,
           refinement_time_ms: refinement.refinement_time_ms,
           search_time_ms: Date.now() - searchStart,
           total_time_ms: Date.now() - searchStart + refinement.refinement_time_ms
         }
       };
     }

     private isValidQuery(query: string): boolean {
       // Length checks
       if (!query || query.length < 3 || query.length > 500) {
         return false;
       }

       // Must contain letters
       if (!/[a-zA-Z]/.test(query)) {
         return false;
       }

       // Check for LLM hallucination patterns
       const hallucinations = [
         'I cannot',
         'I apologize',
         'As an AI',
         'I don\'t have access',
         '```',
         '<thinking>',
         'I\'m sorry'
       ];

       return !hallucinations.some(pattern =>
         query.toLowerCase().includes(pattern.toLowerCase())
       );
     }
   }
   ```

2. Implement prompt engineering in `OpenRouterClient.refineQuery()`:
   ```typescript
   async refineQuery(query: string): Promise<string> {
     const systemPrompt = `You are a talent search query optimizer for LinkedIn profiles in Canada.

Transform natural language queries into precise, keyword-rich search strings optimized for finding people.

RULES:
1. Extract key signals: job titles, skills, companies, locations, seniority
2. Preserve Canadian context (cities, provinces)
3. Use professional terminology (e.g., "RN" not "registered nurse")
4. Include relevant synonyms and variations
5. Keep query under 100 characters
6. Return ONLY the refined query string, no explanations or preamble

EXAMPLES:
Input: "nurses in Hamilton with verified licenses"
Output: "Registered Nurse RN Hamilton Ontario Canada license certification"

Input: "senior data scientists at tech companies Toronto"
Output: "Senior Data Scientist Machine Learning AI (Toronto OR GTA) (Google OR Meta OR Shopify OR tech)"

Now refine this query:`;

     const response = await this.makeRequest({
       model: this.model,
       messages: [
         { role: 'system', content: systemPrompt },
         { role: 'user', content: query }
       ],
       temperature: 0.2,
       max_tokens: 100,
       top_p: 0.9,
       frequency_penalty: 0.5,
       presence_penalty: 0.3
     });

     return response.choices[0].message.content.trim();
   }
   ```

3. Add query validation with security checks (prevent prompt injection)
4. Implement cache eviction strategy (LRU with 1000 entry limit)

**Success Criteria**:
- [ ] Query refinement improves search relevance (manual QA)
- [ ] Cache hit rate >= 30% after 100 searches
- [ ] Invalid LLM outputs are caught and fallback to original
- [ ] Refinement completes in <5s or falls back
- [ ] Prompt injection attempts are blocked

**Estimated Effort**: 6-8 hours

---

#### Phase 4: API Endpoint Integration

**Objective**: Update search endpoint to use agentic search

**Tasks**:
1. Modify `/Users/nidhishgajjar/conversations/healthcarejobs/src/routes/api/search/people/+server.ts`:
   ```typescript
   import { json, type RequestHandler } from '@sveltejs/kit';
   import { AgenticSearchService } from '$lib/server/agentic-search';
   import type { ExaError } from '$lib/types/exa';

   const agenticSearch = new AgenticSearchService();

   export const POST: RequestHandler = async ({ request }) => {
     try {
       const { query } = await request.json();

       // Input validation
       if (!query || typeof query !== 'string') {
         return json(
           { error: 'Query is required and must be a string' },
           { status: 400 }
         );
       }

       if (query.length < 3) {
         return json(
           { error: 'Query must be at least 3 characters' },
           { status: 400 }
         );
       }

       if (query.length > 500) {
         return json(
           { error: 'Query must be less than 500 characters' },
           { status: 400 }
         );
       }

       // Execute agentic search
       const result = await agenticSearch.search(query);

       return json(result);

     } catch (error: any) {
       console.error('Search error:', error);

       // Handle Exa-specific errors (existing pattern)
       if (error.name === 'ExaError') {
         const exaError = error as ExaError;

         switch (exaError.type) {
           case 'AUTHENTICATION':
             return json(
               { error: 'Authentication failed' },
               { status: 401 }
             );
           case 'RATE_LIMIT':
             return json(
               { error: 'Rate limit exceeded. Please try again later.' },
               { status: 429 }
             );
           case 'TIMEOUT':
             return json(
               { error: 'Search timed out. Please try again.' },
               { status: 504 }
             );
           default:
             return json(
               { error: 'An error occurred while searching' },
               { status: 500 }
             );
         }
       }

       // Generic error handling
       return json(
         {
           error: 'An unexpected error occurred',
           message: error.message
         },
         { status: 500 }
       );
     }
   };
   ```

2. Update response types in `src/lib/types/agentic.ts`:
   ```typescript
   export interface AgenticSearchResponse {
     original_query: string;
     refined_query: string;
     results: SearchResult[];
     metadata: {
       llm_used: boolean;
       cached: boolean;
       refinement_time_ms: number;
       search_time_ms: number;
       total_time_ms: number;
       model_used?: string;
     };
   }
   ```

3. Add request logging for monitoring:
   ```typescript
   console.log('Agentic search:', {
     original: query,
     refined: result.refined_query,
     llm_used: result.metadata.llm_used,
     cached: result.metadata.cached,
     refinement_ms: result.metadata.refinement_time_ms,
     search_ms: result.metadata.search_time_ms,
     results_count: result.results.length
   });
   ```

**Success Criteria**:
- [ ] Endpoint returns refined query in response
- [ ] Metadata includes LLM usage and timing information
- [ ] Error handling preserved from original implementation
- [ ] Response time increase acceptable (<3s total)
- [ ] Backward compatible response format

**Estimated Effort**: 3-4 hours

---

#### Phase 5: Frontend Integration

**Objective**: Display refined queries and loading states to users

**Tasks**:
1. Update `src/routes/+page.svelte` to handle new response format:
   ```typescript
   interface SearchState {
     loading: boolean;
     loadingStage: 'thinking' | 'searching' | 'complete';
     query: string;
     refinedQuery: string | null;
     results: SearchResult[];
     error: string | null;
     metadata: {
       llm_used?: boolean;
       cached?: boolean;
       refinement_time_ms?: number;
       search_time_ms?: number;
     } | null;
   }

   let state = $state<SearchState>({
     loading: false,
     loadingStage: 'thinking',
     query: '',
     refinedQuery: null,
     results: [],
     error: null,
     metadata: null
   });

   async function handleSearch(searchQuery: string) {
     state.loading = true;
     state.loadingStage = 'thinking';
     state.error = null;
     state.query = searchQuery;

     try {
       const response = await fetch('/api/search/people', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ query: searchQuery })
       });

       if (!response.ok) {
         const errorData = await response.json();
         throw new Error(errorData.error || 'Search failed');
       }

       state.loadingStage = 'searching';

       const data = await response.json();

       state.refinedQuery = data.refined_query;
       state.results = data.results || [];
       state.metadata = data.metadata;
       state.loadingStage = 'complete';

     } catch (err: any) {
       state.error = err.message;
       state.results = [];
     } finally {
       state.loading = false;
     }
   }
   ```

2. Update `LoadingState.svelte` to show refinement stage:
   ```svelte
   <script lang="ts">
     let { stage = 'searching' }: {
       stage?: 'thinking' | 'searching' | 'complete';
     } = $props();

     const messages = {
       thinking: 'Refining your search...',
       searching: 'Searching for profiles...',
       complete: 'Complete!'
     };

     const icons = {
       thinking: '🤔',
       searching: '🔍',
       complete: '✓'
     };
   </script>

   <div class="loading">
     <div class="spinner"></div>
     <div class="stage">
       <span class="icon">{icons[stage]}</span>
       <p class="text">{messages[stage]}</p>
     </div>
   </div>

   <style>
     .loading {
       display: flex;
       flex-direction: column;
       align-items: center;
       gap: 20px;
       padding: 80px 20px;
     }

     .stage {
       display: flex;
       align-items: center;
       gap: 12px;
     }

     .icon {
       font-size: 24px;
     }

     .text {
       color: #86868b;
       font-size: 17px;
       letter-spacing: -0.022em;
     }

     /* Existing spinner styles... */
   </style>
   ```

3. Add "Refined Query" indicator above results:
   ```svelte
   {#if state.refinedQuery && state.refinedQuery !== state.query}
     <div class="query-refinement">
       <p class="label">Searching for:</p>
       <p class="refined-query">{state.refinedQuery}</p>
       {#if state.metadata?.llm_used}
         <span class="badge">AI-refined</span>
       {/if}
       {#if state.metadata?.cached}
         <span class="badge cached">Cached</span>
       {/if}
     </div>
   {/if}
   ```

4. Style refinement indicator with Radar branding:
   ```css
   .query-refinement {
     background: linear-gradient(135deg, #0A1628 0%, #1a2a3e 100%);
     padding: 16px 20px;
     border-radius: 12px;
     margin-bottom: 24px;
     border: 1px solid rgba(74, 144, 226, 0.2);
   }

   .label {
     color: #86868b;
     font-size: 14px;
     margin: 0 0 8px 0;
   }

   .refined-query {
     color: #4A90E2;
     font-size: 17px;
     font-weight: 500;
     margin: 0 0 8px 0;
     letter-spacing: -0.022em;
   }

   .badge {
     display: inline-block;
     background: rgba(74, 144, 226, 0.15);
     color: #4A90E2;
     padding: 4px 12px;
     border-radius: 16px;
     font-size: 12px;
     font-weight: 500;
     margin-right: 8px;
   }

   .badge.cached {
     background: rgba(16, 185, 129, 0.15);
     color: #10b981;
   }
   ```

**Success Criteria**:
- [ ] Loading states show "Refining..." then "Searching..."
- [ ] Refined query displayed above results when different from original
- [ ] AI-refined badge shows when LLM was used
- [ ] Cached badge shows for cache hits
- [ ] Metadata visible in browser console for debugging

**Estimated Effort**: 4-5 hours

---

#### Phase 6: Testing & Quality Assurance

**Objective**: Comprehensive testing of all components

**Tasks**:
1. Unit tests for `OpenRouterClient`:
   ```typescript
   // src/lib/server/__tests__/openrouter-client.test.ts
   import { describe, it, expect, vi } from 'vitest';
   import { OpenRouterClient } from '../openrouter-client';

   describe('OpenRouterClient', () => {
     it('should refine query successfully', async () => {
       const client = new OpenRouterClient();
       const refined = await client.refineQuery('nurses in Hamilton');
       expect(refined).toBeTruthy();
       expect(refined.length).toBeGreaterThan(0);
     });

     it('should handle rate limiting with retry', async () => {
       // Mock fetch to return 429 twice, then succeed
       global.fetch = vi.fn()
         .mockRejectedValueOnce({ status: 429 })
         .mockRejectedValueOnce({ status: 429 })
         .mockResolvedValueOnce({
           ok: true,
           json: async () => ({
             choices: [{
               message: { content: 'Registered Nurse Hamilton Ontario' }
             }]
           })
         });

       const client = new OpenRouterClient();
       const refined = await client.refineQuery('nurses in Hamilton');
       expect(refined).toBe('Registered Nurse Hamilton Ontario');
       expect(fetch).toHaveBeenCalledTimes(3);
     });

     it('should handle authentication errors', async () => {
       global.fetch = vi.fn().mockRejectedValue({ status: 401 });
       const client = new OpenRouterClient();
       await expect(client.refineQuery('test')).rejects.toThrow();
     });
   });
   ```

2. Unit tests for `CircuitBreaker`:
   ```typescript
   // src/lib/server/__tests__/circuit-breaker.test.ts
   import { describe, it, expect } from 'vitest';
   import { CircuitBreaker } from '../circuit-breaker';

   describe('CircuitBreaker', () => {
     it('should remain CLOSED on success', async () => {
       const cb = new CircuitBreaker(3, 1000);
       await cb.execute(() => Promise.resolve('success'));
       expect(cb.getState().state).toBe('CLOSED');
     });

     it('should OPEN after threshold failures', async () => {
       const cb = new CircuitBreaker(3, 1000);

       for (let i = 0; i < 3; i++) {
         try {
           await cb.execute(() => Promise.reject(new Error('fail')));
         } catch {}
       }

       expect(cb.getState().state).toBe('OPEN');
     });

     it('should throw when OPEN', async () => {
       const cb = new CircuitBreaker(1, 1000);
       try {
         await cb.execute(() => Promise.reject(new Error('fail')));
       } catch {}

       await expect(
         cb.execute(() => Promise.resolve('success'))
       ).rejects.toThrow('Circuit breaker is OPEN');
     });

     it('should transition to HALF_OPEN after timeout', async () => {
       const cb = new CircuitBreaker(1, 100); // 100ms timeout

       try {
         await cb.execute(() => Promise.reject(new Error('fail')));
       } catch {}

       expect(cb.getState().state).toBe('OPEN');

       await new Promise(resolve => setTimeout(resolve, 150));

       // Next execution should attempt in HALF_OPEN state
       await cb.execute(() => Promise.resolve('success'));
       expect(cb.getState().state).toBe('CLOSED');
     });
   });
   ```

3. Integration tests for `AgenticSearchService`:
   ```typescript
   // src/lib/server/__tests__/agentic-search.test.ts
   import { describe, it, expect, vi, beforeEach } from 'vitest';
   import { AgenticSearchService } from '../agentic-search';

   describe('AgenticSearchService', () => {
     let service: AgenticSearchService;

     beforeEach(() => {
       service = new AgenticSearchService();
     });

     it('should return refined query when LLM succeeds', async () => {
       const result = await service.refineQuery('nurses in Hamilton');
       expect(result.original).toBe('nurses in Hamilton');
       expect(result.refined).not.toBe(result.original);
       expect(result.llm_used).toBe(true);
     });

     it('should cache successful refinements', async () => {
       const first = await service.refineQuery('test query');
       const second = await service.refineQuery('test query');

       expect(first.refined).toBe(second.refined);
       expect(first.cached).toBe(false);
       expect(second.cached).toBe(true);
     });

     it('should fallback to original query on LLM failure', async () => {
       // Mock OpenRouter to fail
       vi.spyOn(service['openRouter'], 'refineQuery')
         .mockRejectedValue(new Error('API Error'));

       const result = await service.refineQuery('test query');
       expect(result.refined).toBe('test query');
       expect(result.llm_used).toBe(false);
     });

     it('should complete full search workflow', async () => {
       const result = await service.search('nurses in Hamilton');
       expect(result.original_query).toBeTruthy();
       expect(result.refined_query).toBeTruthy();
       expect(result.results).toBeInstanceOf(Array);
       expect(result.metadata).toBeTruthy();
     });
   });
   ```

4. End-to-end tests for search endpoint:
   ```typescript
   // tests/api/search.test.ts
   import { expect, test } from '@playwright/test';

   test.describe('Agentic Search API', () => {
     test('should refine query and return results', async ({ request }) => {
       const response = await request.post('/api/search/people', {
         data: { query: 'nurses in Hamilton with RN license' }
       });

       expect(response.ok()).toBeTruthy();
       const data = await response.json();

       expect(data.original_query).toBe('nurses in Hamilton with RN license');
       expect(data.refined_query).toBeTruthy();
       expect(data.results).toBeInstanceOf(Array);
       expect(data.metadata.llm_used).toBeDefined();
     });

     test('should handle invalid queries', async ({ request }) => {
       const response = await request.post('/api/search/people', {
         data: { query: 'ab' } // Too short
       });

       expect(response.status()).toBe(400);
       const data = await response.json();
       expect(data.error).toContain('at least 3 characters');
     });

     test('should fallback gracefully on LLM failure', async ({ request }) => {
       // This test would require mocking OpenRouter to fail
       // But search should still complete with original query
       const response = await request.post('/api/search/people', {
         data: { query: 'test query' }
       });

       expect(response.ok()).toBeTruthy();
       const data = await response.json();
       expect(data.results).toBeDefined();
     });
   });
   ```

5. Manual QA test cases:
   - [ ] Search "nurses in Hamilton" → Should find RN professionals in Hamilton, ON
   - [ ] Search "senior software engineers at Shopify" → Should find senior devs at Shopify
   - [ ] Search with typo "enginer" → Should correct to "engineer"
   - [ ] Search vague "marketing person" → Should refine to specific marketing roles
   - [ ] Search location "Toronto" → Should expand to "Toronto OR GTA"
   - [ ] Rapid repeated searches → Should show cache hits
   - [ ] Network disconnect → Should show graceful error
   - [ ] Very long query (>500 chars) → Should show validation error

**Success Criteria**:
- [ ] All unit tests pass (>90% coverage on new code)
- [ ] Integration tests pass
- [ ] End-to-end tests pass in CI/CD
- [ ] Manual QA test cases verified
- [ ] No regressions in existing search functionality
- [ ] Performance benchmarks met (<3s total search time)

**Estimated Effort**: 6-8 hours

---

#### Phase 7: Monitoring & Observability

**Objective**: Track agentic search performance and costs

**Tasks**:
1. Add structured logging throughout the pipeline:
   ```typescript
   // In AgenticSearchService
   console.log('[AGENTIC_SEARCH]', {
     timestamp: new Date().toISOString(),
     event: 'query_refinement',
     original_query: query,
     refined_query: refined,
     llm_used: result.llm_used,
     cached: result.cached,
     refinement_time_ms: result.refinement_time_ms,
     cache_size: this.queryCache.size
   });

   console.log('[AGENTIC_SEARCH]', {
     timestamp: new Date().toISOString(),
     event: 'search_complete',
     query: query,
     results_count: results.length,
     total_time_ms: metadata.total_time_ms,
     llm_used: metadata.llm_used
   });
   ```

2. Create cost tracking utility in `src/lib/server/cost-tracker.ts`:
   ```typescript
   export class CostTracker {
     private costs: Array<{
       timestamp: number;
       model: string;
       input_tokens: number;
       output_tokens: number;
       cost_usd: number;
     }> = [];

     track(usage: {
       model: string;
       input_tokens: number;
       output_tokens: number;
     }) {
       // Grok 4.1 Fast pricing: $0.20 input, $0.50 output per 1M tokens
       const inputCost = (usage.input_tokens / 1_000_000) * 0.20;
       const outputCost = (usage.output_tokens / 1_000_000) * 0.50;
       const totalCost = inputCost + outputCost;

       this.costs.push({
         timestamp: Date.now(),
         model: usage.model,
         input_tokens: usage.input_tokens,
         output_tokens: usage.output_tokens,
         cost_usd: totalCost
       });

       console.log('[COST_TRACKER]', {
         model: usage.model,
         tokens: usage.input_tokens + usage.output_tokens,
         cost_usd: totalCost.toFixed(6)
       });
     }

     getStats(periodMs: number = 86400000) { // 24 hours
       const cutoff = Date.now() - periodMs;
       const recentCosts = this.costs.filter(c => c.timestamp > cutoff);

       return {
         total_requests: recentCosts.length,
         total_tokens: recentCosts.reduce(
           (sum, c) => sum + c.input_tokens + c.output_tokens,
           0
         ),
         total_cost_usd: recentCosts.reduce((sum, c) => sum + c.cost_usd, 0),
         avg_cost_per_request: recentCosts.length > 0
           ? recentCosts.reduce((sum, c) => sum + c.cost_usd, 0) / recentCosts.length
           : 0
       };
     }
   }
   ```

3. Add health check endpoint in `src/routes/api/health/+server.ts`:
   ```typescript
   import { json, type RequestHandler } from '@sveltejs/kit';
   import { agenticSearch } from '$lib/server/agentic-search';

   export const GET: RequestHandler = async () => {
     const circuitBreakerState = agenticSearch.getCircuitBreakerState();
     const cacheStats = agenticSearch.getCacheStats();
     const costStats = agenticSearch.getCostStats();

     return json({
       status: 'healthy',
       timestamp: new Date().toISOString(),
       circuit_breaker: circuitBreakerState,
       cache: cacheStats,
       costs: costStats,
       uptime_ms: process.uptime() * 1000
     });
   };
   ```

4. Set up alerting thresholds:
   - Circuit breaker open for >5 minutes → Alert
   - Average refinement time >3s → Alert
   - Cache hit rate <20% → Warning
   - Daily cost >$10 → Alert
   - Error rate >5% → Alert

**Success Criteria**:
- [ ] All search events logged with structured JSON
- [ ] Cost tracking accurate to 3 decimal places
- [ ] Health endpoint returns useful diagnostics
- [ ] Alerts configured in monitoring system
- [ ] Dashboard showing key metrics (refinement time, cache hits, costs)

**Estimated Effort**: 4-5 hours

---

## Alternative Approaches Considered

### 1. Multi-Query Parallel Search

**Description**: Generate 2-3 refined queries from different angles and search Exa with all of them in parallel.

**Pros**:
- More comprehensive results coverage
- Explores talent pool from multiple perspectives
- Higher chance of finding relevant candidates

**Cons**:
- 3x API cost (Exa charges per search)
- More complex deduplication required
- Longer response times (waiting for slowest search)
- Potential for overwhelming users with too many results

**Why Not Chosen**: Cost and complexity outweigh benefits for MVP. Single refined query is sufficient for most use cases. Can revisit for premium tier.

---

### 2. Client-Side LLM Integration

**Description**: Call OpenRouter directly from browser using client-side JavaScript.

**Pros**:
- Reduced server load
- Faster perceived response (no extra hop)
- Could enable streaming UI updates

**Cons**:
- Exposes API keys to client (CRITICAL SECURITY ISSUE)
- No caching possible
- No circuit breaker protection
- CORS complications
- Higher costs (can't batch/optimize)

**Why Not Chosen**: Security and cost concerns make this a non-starter.

---

### 3. Local LLM (Ollama/llama.cpp)

**Description**: Self-host a small LLM locally for query refinement instead of using OpenRouter.

**Pros**:
- No per-query cost
- Full control over model
- No external API dependency
- Privacy-preserving

**Cons**:
- Requires GPU infrastructure (~$500-2000/month)
- Model quality significantly lower than Grok Fast
- Higher latency (self-hosted inference slower)
- Operational complexity (model updates, monitoring)
- Initial setup cost and time

**Why Not Chosen**: $0.0002 per query (Grok Fast) is far cheaper than GPU infrastructure until hitting ~1M queries/month. Keep it simple for MVP.

---

### 4. Rule-Based Query Enhancement Only

**Description**: Use heuristics and regex patterns to enhance queries without LLM.

**Example**:
```typescript
function enhanceQuery(query: string): string {
  // Extract location
  const location = extractCanadianCity(query);

  // Extract role keywords
  const roles = extractRoleKeywords(query);

  // Reconstruct optimized query
  return `${roles.join(' OR ')} ${location} Canada`;
}
```

**Pros**:
- Zero API cost
- Instant response (no network call)
- Predictable behavior
- No external dependencies

**Cons**:
- Brittle (breaks on edge cases)
- Requires extensive rule engineering
- Can't understand semantic intent
- Misses nuances and synonyms
- High maintenance burden

**Why Not Chosen**: LLM provides far superior query understanding with minimal cost. Rule-based can be fallback, not primary approach.

---

## Acceptance Criteria

### Functional Requirements

- [ ] User enters natural language query (e.g., "nurses in Hamilton with RN license")
- [ ] System refines query using Grok Fast LLM
- [ ] Refined query displayed to user for transparency
- [ ] Search executes with refined query against Exa People API
- [ ] Results returned within 3 seconds (95th percentile)
- [ ] System falls back to original query if LLM fails
- [ ] Repeated queries served from cache (no API call)
- [ ] Circuit breaker prevents cascading failures
- [ ] All errors handled gracefully with user-friendly messages

### Non-Functional Requirements

- [ ] **Performance**: P95 latency <3s, P99 latency <5s
- [ ] **Cost**: Average cost per search <$0.002 ($0.0002 LLM + ~$0.0015 Exa)
- [ ] **Reliability**: 99.5% uptime (excluding Exa outages)
- [ ] **Cache Hit Rate**: >30% after 100 searches
- [ ] **Security**: No API keys exposed to client
- [ ] **Observability**: All searches logged with timing and metadata
- [ ] **Error Handling**: No user-facing errors due to LLM failure

### Quality Gates

- [ ] All unit tests pass (>90% coverage on new code)
- [ ] Integration tests pass
- [ ] End-to-end tests pass
- [ ] No TypeScript compilation errors
- [ ] No ESLint warnings on new code
- [ ] Manual QA scenarios verified
- [ ] Security review completed (API key handling)
- [ ] Performance benchmarks met
- [ ] Cost estimates validated with real usage

---

## Success Metrics

### Phase 1 Metrics (First 7 Days)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Search Query Refinement Rate | 80%+ queries refined | % queries where refined ≠ original |
| Cache Hit Rate | 30%+ | % queries served from cache |
| LLM Fallback Rate | <10% | % searches using original query due to LLM failure |
| Average Refinement Time | <500ms | P50 LLM response time |
| Average Total Search Time | <2.5s | P50 end-to-end time |
| Cost per Search | <$0.002 | (LLM cost + Exa cost) / searches |
| Error Rate | <2% | % searches resulting in error |

### Phase 2 Metrics (After 30 Days)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Result Quality Improvement | 20%+ vs baseline | A/B test: click-through rate on results |
| User Satisfaction | 4.0+ / 5.0 | Post-search feedback survey |
| Cache Hit Rate (Mature) | 40%+ | % queries served from cache |
| Circuit Breaker Activations | <5 per day | # times circuit opens |
| Total API Spend | <$50/month | Monthly OpenRouter + Exa bill |
| Search Abandonment Rate | <15% | % users leaving before clicking result |

### Business Impact (After 90 Days)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Candidate Discovery Rate | 25%+ increase | # unique candidates found per recruiter |
| Search-to-Contact Conversion | 15%+ increase | % searches leading to outreach (when feature added) |
| User Retention | 10%+ increase | Weekly active users month-over-month |
| Premium Conversion | 5%+ increase | % free users upgrading to paid tier |

---

## Dependencies & Prerequisites

### Technical Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| OpenRouter API | Latest | LLM query refinement |
| Grok 4.1 Fast | Latest | Specific model for refinement |
| Exa People API | v1 | Primary search engine |
| SvelteKit | 2.0+ | Application framework |
| TypeScript | 5.0+ | Type safety |
| Node.js | 18+ | Runtime environment |

### Environment Variables Required

```env
# Existing
EXA_API_KEY=a17c2c78-2c91-4d68-8333-5fb1ee0b59a3
PUBLIC_APP_NAME=Healthcare Jobs - People Search

# New - Required for this feature
OPENROUTER_API_KEY=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
OPENROUTER_MODEL=x-ai/grok-4.1-fast

# New - Optional configuration
OPENROUTER_TIMEOUT_MS=5000
QUERY_REFINEMENT_ENABLED=true
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT_MS=60000
CACHE_TTL_MS=3600000
```

### External Service Dependencies

1. **OpenRouter API** (Critical Path)
   - Signup: https://openrouter.ai/
   - API key obtained: ✅ (provided by user)
   - Rate limits: 4M tokens/min, 480 requests/min (sufficient for MVP)
   - Pricing: $0.20 input / $0.50 output per 1M tokens

2. **Exa People API** (Critical Path)
   - Already integrated ✅
   - API key configured ✅
   - No changes needed

### Internal Dependencies

- **Current Search Infrastructure**: Must remain functional during rollout
- **Error Handling Patterns**: Extend existing `ExaError` pattern
- **TypeScript Types**: Follow existing conventions in `src/lib/types/`

---

## Risk Analysis & Mitigation

### High-Priority Risks

#### 1. OpenRouter API Availability

**Risk**: OpenRouter or Grok Fast model becomes unavailable, breaking search functionality.

**Impact**: HIGH - Users unable to search effectively

**Likelihood**: MEDIUM - Third-party API dependencies inherently risky

**Mitigation**:
- ✅ **Circuit breaker** pattern prevents cascading failures
- ✅ **Fallback to original query** ensures search always works
- ✅ **Health monitoring** alerts team immediately on outages
- ✅ **Graceful degradation** displays message "AI refinement unavailable" but proceeds with search

**Contingency Plan**: Disable `QUERY_REFINEMENT_ENABLED=false` env var to revert to direct Exa search

---

#### 2. Cost Overruns

**Risk**: Higher than expected usage leads to unexpected API costs.

**Impact**: MEDIUM - Budget impact, potential service restriction

**Likelihood**: MEDIUM - Traffic patterns unpredictable at launch

**Mitigation**:
- ✅ **Query caching** (1-hour TTL) reduces duplicate API calls
- ✅ **Cost tracking** logs every API call with cost calculation
- ✅ **Budget alerts** trigger at $10/day, $50/week thresholds
- ✅ **Rate limiting** on API endpoint prevents abuse (future enhancement)

**Contingency Plan**: Implement user-based rate limiting (10 searches/hour free tier)

---

#### 3. LLM Hallucinations / Invalid Output

**Risk**: Grok Fast produces nonsensical or harmful query refinements.

**Impact**: HIGH - Poor search results, user frustration

**Likelihood**: MEDIUM - LLMs can produce unexpected outputs

**Mitigation**:
- ✅ **Output validation** checks for hallucination patterns
- ✅ **Length constraints** (3-500 characters) prevent extreme outputs
- ✅ **Fallback to original** when validation fails
- ✅ **Low temperature** (0.2) reduces creativity/hallucination
- ✅ **Logging all refinements** enables post-hoc analysis

**Contingency Plan**: Maintain blacklist of problematic refinements, auto-fallback on detection

---

#### 4. Circuit Breaker False Positives

**Risk**: Circuit breaker opens unnecessarily during normal operation.

**Impact**: MEDIUM - Unnecessary fallbacks reduce refinement benefit

**Likelihood**: LOW - Well-tuned thresholds should prevent this

**Mitigation**:
- ✅ **Tuned threshold** (5 failures before opening)
- ✅ **Short timeout** (60s) allows quick recovery
- ✅ **Half-open state** tests recovery before fully closing
- ✅ **Monitoring** tracks circuit state changes

**Contingency Plan**: Adjust threshold based on real-world failure patterns

---

### Medium-Priority Risks

#### 5. Cache Poisoning

**Risk**: Invalid refinements get cached and repeatedly used.

**Impact**: MEDIUM - Poor results for cached queries until TTL expires

**Likelihood**: LOW - Validation catches most issues

**Mitigation**:
- ✅ **Validation before caching** ensures only good refinements cached
- ✅ **Short TTL** (1 hour) limits impact window
- ✅ **Manual cache clear** API endpoint for emergency purging

---

#### 6. Prompt Injection Attacks

**Risk**: Malicious users craft queries to manipulate LLM behavior.

**Impact**: MEDIUM - Could extract API keys or bypass restrictions

**Likelihood**: LOW - Server-side processing limits attack surface

**Mitigation**:
- ✅ **Input sanitization** strips markdown, code blocks, system commands
- ✅ **Server-side only** LLM calls prevent direct manipulation
- ✅ **Output validation** catches suspicious responses
- ✅ **Rate limiting** prevents brute-force attempts (future)

---

#### 7. Performance Degradation

**Risk**: LLM refinement adds unacceptable latency.

**Impact**: MEDIUM - User experience suffers, increased abandonment

**Likelihood**: LOW - 5s timeout prevents extreme cases

**Mitigation**:
- ✅ **Timeout configuration** (5s max for refinement)
- ✅ **Parallel processing** where possible
- ✅ **Cache hits** eliminate latency for repeat queries
- ✅ **Performance monitoring** tracks P50/P95/P99 latencies

---

### Low-Priority Risks

#### 8. Model Deprecation

**Risk**: Grok 4.1 Fast model deprecated by xAI.

**Impact**: LOW - Can switch to alternate model

**Likelihood**: LOW - Recently launched (Dec 2024)

**Mitigation**:
- ✅ **Model configuration** via env var enables quick switching
- ✅ **OpenRouter abstraction** supports multiple providers/models
- ✅ **Fallback model** config (e.g., GPT-3.5-turbo)

---

## Resource Requirements

### Development Time

| Phase | Hours | Developer Role |
|-------|-------|----------------|
| 1. OpenRouter Client | 4-6h | Backend Engineer |
| 2. Circuit Breaker | 3-4h | Backend Engineer |
| 3. Query Refinement Service | 6-8h | Backend Engineer |
| 4. API Integration | 3-4h | Backend Engineer |
| 5. Frontend Updates | 4-5h | Frontend Engineer |
| 6. Testing & QA | 6-8h | QA Engineer + Backend |
| 7. Monitoring & Observability | 4-5h | DevOps/Backend |
| **Total Estimated** | **30-40h** | **~1 week sprint** |

### Infrastructure

| Resource | Current | Additional | Cost |
|----------|---------|------------|------|
| Compute (Server) | Existing SvelteKit app | None | $0 |
| OpenRouter API | N/A | Pay-per-use | ~$5-20/month |
| Exa API | Existing | No change | $50/month (existing) |
| Monitoring | Basic logs | Structured logging | $0 (stdout) |
| **Total Additional** | | | **$5-20/month** |

### Team

- **1 Backend Engineer**: Primary development (OpenRouter integration, service layer)
- **1 Frontend Engineer**: UI updates (loading states, refined query display)
- **1 QA Engineer**: Testing strategy, test case execution (can be part-time)
- **Product Manager**: Requirements validation, user feedback collection (part-time)
- **DevOps/SRE**: Monitoring setup, alerting configuration (2-3 hours)

---

## Future Considerations

### v2 Enhancements (Post-MVP)

1. **Multi-Query Parallel Search**
   - Generate 2-3 queries from different angles
   - Search Exa with all in parallel
   - Deduplicate and synthesize results
   - **Benefit**: More comprehensive candidate discovery
   - **Cost**: 3x Exa API usage

2. **Semantic Result Ranking**
   - Use LLM to re-rank Exa results based on original user intent
   - Apply ML model for relevance scoring
   - **Benefit**: Better result quality
   - **Cost**: Additional LLM call per search

3. **Query Suggestion/Autocomplete**
   - As user types, suggest refined queries
   - Powered by cache + common patterns
   - **Benefit**: Faster query formulation
   - **Cost**: Minimal (cache-based)

4. **User Feedback Loop**
   - "Was this refined query helpful?" thumbs up/down
   - Train custom fine-tuned model on feedback
   - **Benefit**: Continuous improvement
   - **Cost**: Model training infrastructure

5. **Advanced Caching Strategy**
   - Redis-backed distributed cache
   - Semantic similarity-based cache hits
   - Longer TTLs for stable queries
   - **Benefit**: Higher cache hit rate, lower costs
   - **Cost**: Redis hosting (~$10-20/month)

### Extensibility

**Design Patterns Applied**:
- **Strategy Pattern**: Easy to swap LLM providers (OpenRouter → Anthropic → OpenAI)
- **Circuit Breaker Pattern**: Prevents cascade failures, isolates external dependencies
- **Cache-Aside Pattern**: Improves performance, reduces costs
- **Fallback Pattern**: Graceful degradation when components fail

**Extension Points**:
```typescript
// Easy to add new LLM providers
interface LLMProvider {
  refineQuery(query: string): Promise<string>;
}

class OpenRouterProvider implements LLMProvider { }
class AnthropicProvider implements LLMProvider { }
class OpenAIProvider implements LLMProvider { }

// Swap providers via config
const provider = config.llm_provider === 'anthropic'
  ? new AnthropicProvider()
  : new OpenRouterProvider();
```

---

## Documentation Plan

### Code Documentation

1. **Inline Comments**:
   - Complex logic (circuit breaker state transitions)
   - Non-obvious optimizations (cache eviction strategy)
   - Security-critical sections (prompt injection prevention)

2. **JSDoc/TSDoc**:
   - All public methods with parameter descriptions
   - Return types and possible exceptions
   - Usage examples for key classes

3. **README Updates**:
   - New environment variables and their purposes
   - Architecture diagram with agentic layer
   - Troubleshooting section for common issues

### API Documentation

1. **OpenAPI Spec Update**:
   - New response fields (refined_query, metadata)
   - Example requests/responses
   - Error codes specific to agentic search

2. **Endpoint Documentation**:
   ```markdown
   ## POST /api/search/people

   ### New Response Fields

   | Field | Type | Description |
   |-------|------|-------------|
   | `refined_query` | string | LLM-optimized search query |
   | `metadata.llm_used` | boolean | Whether LLM refinement was used |
   | `metadata.cached` | boolean | Whether result came from cache |
   | `metadata.refinement_time_ms` | number | Time spent on query refinement |
   | `metadata.search_time_ms` | number | Time spent searching Exa |

   ### Example Response

   ```json
   {
     "original_query": "nurses in Hamilton",
     "refined_query": "Registered Nurse RN Hamilton Ontario Canada",
     "results": [...],
     "metadata": {
       "llm_used": true,
       "cached": false,
       "refinement_time_ms": 234,
       "search_time_ms": 456,
       "total_time_ms": 690
     }
   }
   ```
   ```

### Runbook Documentation

1. **Deployment Guide**:
   - Pre-deployment checklist (env vars, tests)
   - Rollout strategy (canary, blue-green)
   - Rollback procedure

2. **Operations Guide**:
   - Monitoring dashboards and key metrics
   - Alert runbook (what to do when circuit breaker opens)
   - Cost tracking and budget management
   - Cache management (clear, inspect, tune)

3. **Troubleshooting Guide**:
   - Symptom: "All queries using original, not refined"
     - Check: Circuit breaker state, OpenRouter API status
   - Symptom: "Slow search response times"
     - Check: LLM timeout configuration, cache hit rate
   - Symptom: "Unexpected API costs"
     - Check: Cache hit rate, query patterns, abuse

---

## References & Research

### Internal References

- **Current Implementation**: `/Users/nidhishgajjar/conversations/healthcarejobs/src/routes/api/search/people/+server.ts`
- **Exa Wrapper**: `/Users/nidhishgajjar/conversations/healthcarejobs/src/lib/server/exa-wrapper.ts`
- **Type Definitions**: `/Users/nidhishgajjar/conversations/healthcarejobs/src/lib/types/exa.ts`
- **Brainstorm Document**: `/Users/nidhishgajjar/conversations/healthcarejobs/docs/brainstorms/2026-01-22-radar-product-vision.md`
- **Original Plan**: `/Users/nidhishgajjar/conversations/healthcarejobs/docs/plans/2026-01-22-feat-exa-people-search-webapp-plan.md`

### External References

#### OpenRouter & Grok Fast
- [OpenRouter API Reference](https://openrouter.ai/docs/api/reference/overview)
- [OpenRouter Authentication](https://openrouter.ai/docs/api/reference/authentication)
- [OpenRouter Error Handling](https://openrouter.ai/docs/api/reference/errors-and-debugging)
- [xAI Grok 4.1 Fast Model](https://openrouter.ai/x-ai/grok-4.1-fast)
- [Grok 4.1 Fast Announcement](https://x.ai/news/grok-4-1-fast)

#### Agentic Search Patterns
- [7 Agentic AI Trends (2026)](https://machinelearningmastery.com/7-agentic-ai-trends-to-watch-in-2026/)
- [Survey of LLM-based Deep Search Agents](https://arxiv.org/html/2508.05668v3)
- [Multi-Agent LLM Systems Failures](https://galileo.ai/blog/multi-agent-llm-systems-fail)

#### LLM Best Practices
- [LLM Settings - Prompt Engineering Guide](https://www.promptingguide.ai/introduction/settings)
- [Temperature and Top-p Parameters](https://promptengineering.org/prompt-engineering-with-temperature-and-top-p/)
- [Multi-Provider LLM Orchestration (2026)](https://dev.to/ash_dubai/multi-provider-llm-orchestration-in-production-a-2026-guide-1g10)

#### Semantic Deduplication
- [Evaluating Deduplication with Semantic Similarity](https://arxiv.org/html/2410.01141v3)

#### Exa People API
- [Introducing Exa People Search](https://exa.ai/docs/changelog/people-search-launch)
- [Exa People Search Benchmarks](https://exa.ai/blog/people-search-benchmark)

---

## Appendix

### Cost Calculation Example

**Assumptions**:
- 1000 searches per day
- 30% cache hit rate
- Average query: 20 tokens input, 15 tokens output (Grok Fast)
- Exa: $0.001 per search

**LLM Costs (OpenRouter - Grok 4.1 Fast)**:
```
Searches requiring LLM: 1000 * (1 - 0.30) = 700 searches/day
Input tokens: 700 * 20 = 14,000 tokens/day
Output tokens: 700 * 15 = 10,500 tokens/day

Input cost: (14,000 / 1,000,000) * $0.20 = $0.0028/day
Output cost: (10,500 / 1,000,000) * $0.50 = $0.00525/day
Total LLM: $0.00805/day = $0.24/month
```

**Exa Costs**:
```
Exa searches: 1000 searches/day
Cost: 1000 * $0.001 = $1.00/day = $30/month
```

**Total**: ~$30.24/month for 1000 searches/day

**At Scale (10,000 searches/day)**: ~$302/month

---

### Environment Variable Reference

```bash
# .env file structure

# === Existing Configuration ===
EXA_API_KEY=a17c2c78-2c91-4d68-8333-5fb1ee0b59a3
PUBLIC_APP_NAME=Healthcare Jobs - People Search

# === New: OpenRouter Integration (REQUIRED) ===
OPENROUTER_API_KEY=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
# Model to use for query refinement
OPENROUTER_MODEL=x-ai/grok-4.1-fast

# === Optional: Performance Tuning ===
# Max time to wait for LLM response (milliseconds)
OPENROUTER_TIMEOUT_MS=5000
# Enable/disable query refinement (for emergency rollback)
QUERY_REFINEMENT_ENABLED=true

# === Optional: Circuit Breaker Configuration ===
# Number of failures before circuit opens
CIRCUIT_BREAKER_THRESHOLD=5
# Time to wait before attempting HALF_OPEN (milliseconds)
CIRCUIT_BREAKER_TIMEOUT_MS=60000

# === Optional: Caching Configuration ===
# Time to keep cached refinements (milliseconds, default 1 hour)
CACHE_TTL_MS=3600000
# Maximum cache entries (LRU eviction)
CACHE_MAX_ENTRIES=1000
```

---

### Sample Search Flow

**User Input**: `"nurses in Hamilton with verified licenses"`

**Step 1: Validation**
```typescript
✓ Length: 45 characters (3-500 range)
✓ Contains letters: true
✓ No injection patterns detected
```

**Step 2: Cache Check**
```typescript
Cache key: "nurses in hamilton with verified licenses"
Result: MISS (first search)
```

**Step 3: LLM Refinement**
```typescript
Request to OpenRouter:
{
  model: "x-ai/grok-4.1-fast",
  messages: [
    { role: "system", content: "You are a talent search..." },
    { role: "user", content: "nurses in Hamilton with verified licenses" }
  ],
  temperature: 0.2,
  max_tokens: 100
}

Response:
{
  choices: [{
    message: {
      content: "Registered Nurse RN Hamilton Ontario Canada licensed certified"
    }
  }],
  usage: {
    prompt_tokens: 87,
    completion_tokens: 12,
    total_tokens: 99
  }
}

Validation: ✓ PASS
Refined query: "Registered Nurse RN Hamilton Ontario Canada licensed certified"
```

**Step 4: Exa Search**
```typescript
Request to Exa:
{
  query: "Registered Nurse RN Hamilton Ontario Canada licensed certified",
  category: "people",
  type: "auto",
  numResults: 20,
  userLocation: "ca",
  includeDomains: ["linkedin.com"]
}

Response: 20 LinkedIn profiles
```

**Step 5: Cache Store**
```typescript
Cache SET:
  key: "nurses in hamilton with verified licenses"
  value: {
    query: "Registered Nurse RN Hamilton Ontario Canada licensed certified",
    timestamp: 1706000000000
  }
  ttl: 3600000ms (1 hour)
```

**Step 6: Response to Client**
```json
{
  "original_query": "nurses in Hamilton with verified licenses",
  "refined_query": "Registered Nurse RN Hamilton Ontario Canada licensed certified",
  "results": [
    {
      "id": "abc123",
      "title": "Jane Smith - Registered Nurse at Hamilton Health Sciences",
      "url": "https://linkedin.com/in/janesmith",
      "score": 0.95,
      "text": "Experienced RN with 10+ years...",
      // ... more fields
    },
    // ... 19 more results
  ],
  "metadata": {
    "llm_used": true,
    "cached": false,
    "refinement_time_ms": 234,
    "search_time_ms": 456,
    "total_time_ms": 690,
    "model_used": "x-ai/grok-4.1-fast"
  }
}
```

---

## Sign-Off

**Plan Author**: Claude Sonnet 4.5
**Date**: 2026-01-22
**Stakeholders**: Product, Engineering, Operations
**Approval Status**: Pending Review

**Key Decision Points**:
- ✅ Use Grok 4.1 Fast (not Grok 4 Fast) for 50% lower hallucination rate
- ✅ Single refined query approach (not multi-query) for MVP
- ✅ 1-hour cache TTL balances freshness vs cost savings
- ✅ Circuit breaker with 5-failure threshold prevents cascading failures
- ✅ Fall back to original query ensures search never completely fails

**Next Steps**:
1. Review and approve this plan
2. Run `/workflows:work` to begin implementation
3. Set up OpenRouter account and validate API key
4. Create feature branch: `feat/agentic-search-layer`
5. Begin Phase 1 development
