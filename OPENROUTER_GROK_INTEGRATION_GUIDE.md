# OpenRouter + Grok Fast Integration Guide for SvelteKit

**Last Updated:** January 2026

> **Deprecation Status:** ✅ Both OpenRouter API and xAI Grok models are actively maintained with no deprecation announcements as of January 2026.

---

## Table of Contents

1. [OpenRouter API Overview](#openrouter-api-overview)
2. [Grok Fast Model Specifications](#grok-fast-model-specifications)
3. [Authentication](#authentication)
4. [Request/Response Formats](#requestresponse-formats)
5. [SvelteKit Integration Patterns](#sveltekit-integration-patterns)
6. [Error Handling & Rate Limits](#error-handling--rate-limits)
7. [Streaming Implementation](#streaming-implementation)
8. [Production-Ready Examples](#production-ready-examples)
9. [Best Practices](#best-practices)

---

## OpenRouter API Overview

**Base URL:** `https://openrouter.ai/api/v1`

**Endpoint:** `/chat/completions`

OpenRouter provides a unified API to access 400+ AI models from multiple providers, including xAI's Grok models. It normalizes request/response formats across providers and handles automatic fallback on provider errors.

### Key Features

- OpenAI-compatible API format
- Automatic GPU routing and fallback
- Normalized token counting (GPT-4o tokenizer)
- Support for streaming, tools, structured outputs
- Per-request model selection

---

## Grok Fast Model Specifications

### Grok 4 Fast (`x-ai/grok-4-fast`)

**Released:** Late 2024
**Purpose:** Cost-efficient reasoning model with SOTA cost-efficiency

| Feature | Specification |
|---------|---------------|
| **Context Window** | 2,000,000 tokens |
| **Max Completion** | 30,000 tokens |
| **Input Pricing** | $0.20/M tokens (standard)<br>$0.40/M tokens (>128K context) |
| **Output Pricing** | $0.50/M tokens (standard)<br>$1.00/M tokens (>128K context) |
| **Cache Read** | $0.05/M tokens |
| **Multimodal** | Text + Images |
| **Streaming** | ✅ Yes |
| **Tools/Functions** | ✅ Supported |
| **Reasoning Mode** | ✅ Enabled via `reasoning_enabled` parameter |
| **Structured Output** | ✅ Supported |

**Best For:**
- Cost-efficient reasoning tasks
- General-purpose queries with large context
- Applications requiring frontier performance at lower cost

---

### Grok 4.1 Fast (`x-ai/grok-4.1-fast`)

**Released:** November 2025
**Purpose:** xAI's best agentic tool-calling model

| Feature | Specification |
|---------|---------------|
| **Context Window** | 2,000,000 tokens |
| **Max Completion** | 30,000 tokens |
| **Input Pricing** | $0.20/M tokens (standard)<br>$0.40/M tokens (>128K context) |
| **Output Pricing** | $0.50/M tokens (standard)<br>$1.00/M tokens (>128K context) |
| **Cache Read** | $0.05/M tokens |
| **Multimodal** | Text + Images |
| **Streaming** | ✅ Yes |
| **Tools/Functions** | ✅ Advanced (trained for multi-step agentic tasks) |
| **Reasoning Mode** | ✅ Enabled via `reasoning_enabled` parameter |
| **Structured Output** | ✅ Supported |
| **Hallucination Rate** | 50% lower than Grok 4 Fast |

**Best For:**
- Customer support with tool calling
- Multi-step agentic workflows
- Real-time applications requiring tool use
- Enterprise use cases (finance, telecom)

**Key Improvements Over Grok 4 Fast:**
- **Halved hallucination rate** while maintaining performance
- **Superior tool-calling** via long-horizon RL training
- **Multi-turn optimization** across full 2M context
- **Model Context Protocol (MCP)** support

**Rate Limits:** 4M tokens/minute, 480 requests/minute

---

### Model Selection Guide

```typescript
// Use Grok 4.1 Fast for:
const AGENTIC_MODEL = "x-ai/grok-4.1-fast";
// - Customer support with tools
// - Multi-step reasoning with function calling
// - Real-time search + code execution
// - High factuality requirements

// Use Grok 4 Fast for:
const COST_EFFICIENT_MODEL = "x-ai/grok-4-fast";
// - General reasoning without tools
// - Budget-sensitive applications
// - Batch processing large contexts
```

---

## Authentication

### API Key Setup

```typescript
// Environment variable (recommended)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Never hardcode keys
// ❌ const key = "sk-or-v1-...";
```

### Required Headers

```typescript
const headers = {
  "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
  "Content-Type": "application/json",
  // Optional: App identification for leaderboard visibility
  "HTTP-Referer": "https://your-app.com",
  "X-Title": "Your App Name"
};
```

**Important:**
- `Authorization` header is **required**
- `HTTP-Referer` and `X-Title` are **optional** but recommended for visibility on OpenRouter's leaderboard

---

## Request/Response Formats

### Basic Request Structure

```typescript
interface OpenRouterRequest {
  model: string;           // Required: e.g., "x-ai/grok-4.1-fast"
  messages: Message[];     // Required

  // Common parameters
  stream?: boolean;        // Enable SSE streaming
  max_tokens?: number;     // Max completion length
  temperature?: number;    // 0-2, default varies by model
  top_p?: number;         // Nucleus sampling

  // Advanced parameters
  tools?: Tool[];         // Function/tool definitions
  tool_choice?: string;   // "auto" | "none" | "required"
  reasoning_enabled?: boolean; // Enable reasoning mode
  response_format?: {     // Structured output
    type: "json_object" | "text"
  };

  // OpenRouter-specific
  provider?: {
    order?: string[];     // Provider preference
    require_parameters?: boolean;
  };
}

interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
}
```

### Response Structure

```typescript
interface OpenRouterResponse {
  id: string;
  model: string;          // Actual model used
  choices: Choice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  created: number;
}

interface Choice {
  index: number;
  message: {            // Non-streaming
    role: string;
    content: string;
    tool_calls?: ToolCall[];
    reasoning_details?: ReasoningDetail[]; // If reasoning enabled
  };
  delta?: {            // Streaming only
    role?: string;
    content?: string;
    tool_calls?: ToolCall[];
  };
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | "error";
}
```

### Error Response

```typescript
interface OpenRouterError {
  error: {
    code: number;      // HTTP status code
    message: string;
    metadata?: {
      provider_name?: string;
      raw?: any;      // Provider-specific error
    };
  };
}
```

---

## SvelteKit Integration Patterns

### Server-Side API Route (+server.ts)

**Location:** `src/routes/api/refine-query/+server.ts`

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export const POST: RequestHandler = async ({ request, fetch }) => {
  // 1. Validate API key
  if (!OPENROUTER_API_KEY) {
    throw error(500, 'OpenRouter API key not configured');
  }

  // 2. Parse request body
  let userQuery: string;
  try {
    const body = await request.json();
    userQuery = body.query;

    if (!userQuery?.trim()) {
      throw error(400, 'Query is required');
    }
  } catch (err) {
    throw error(400, 'Invalid request body');
  }

  // 3. Call OpenRouter with retry logic
  try {
    const response = await callOpenRouterWithRetry({
      model: 'x-ai/grok-4.1-fast',
      messages: [
        {
          role: 'system',
          content: 'You are a search query optimizer. Refine user queries to be more specific and effective for job search. Return only the refined query, no explanation.'
        },
        {
          role: 'user',
          content: userQuery
        }
      ],
      max_tokens: 150,
      temperature: 0.3
    }, fetch);

    const data = await response.json();

    // 4. Extract refined query
    const refinedQuery = data.choices[0]?.message?.content?.trim();

    if (!refinedQuery) {
      throw error(502, 'No response from AI model');
    }

    // 5. Return success response
    return json({
      original: userQuery,
      refined: refinedQuery,
      usage: data.usage
    });

  } catch (err: any) {
    console.error('OpenRouter API error:', err);

    // Handle specific error codes
    if (err.status === 429) {
      throw error(429, 'Rate limit exceeded. Please try again in a few moments.');
    }

    throw error(502, `Failed to refine query: ${err.message}`);
  }
};

// Helper function with retry logic
async function callOpenRouterWithRetry(
  body: any,
  fetchFn: typeof fetch,
  retryCount = 0,
  maxRetries = 3
): Promise<Response> {
  const response = await fetchFn(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://healthcarejobs.ca',
      'X-Title': 'HealthcareJobs Query Refiner'
    },
    body: JSON.stringify(body)
  });

  // Retry on server errors (500+)
  if (!response.ok && response.status >= 500 && retryCount < maxRetries) {
    await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
    return callOpenRouterWithRetry(body, fetchFn, retryCount + 1, maxRetries);
  }

  // Throw on client errors (400-499) - don't retry
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw {
      status: response.status,
      message: errorData.error?.message || 'OpenRouter API error'
    };
  }

  return response;
}
```

### Client-Side Usage

**Location:** `src/routes/jobs/+page.svelte`

```svelte
<script lang="ts">
  let query = $state('');
  let refinedQuery = $state('');
  let isRefining = $state(false);
  let error = $state('');

  async function refineQuery() {
    if (!query.trim()) return;

    isRefining = true;
    error = '';

    try {
      const response = await fetch('/api/refine-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to refine query');
      }

      const data = await response.json();
      refinedQuery = data.refined;

      // Use refined query for search
      await searchJobs(refinedQuery);

    } catch (err: any) {
      error = err.message;
      console.error('Query refinement error:', err);
    } finally {
      isRefining = false;
    }
  }

  async function searchJobs(searchQuery: string) {
    // Call your job search API with refined query
    console.log('Searching with:', searchQuery);
  }
</script>

<div class="search-container">
  <input
    type="text"
    bind:value={query}
    placeholder="Enter job search query..."
    disabled={isRefining}
  />

  <button onclick={refineQuery} disabled={isRefining || !query.trim()}>
    {isRefining ? 'Refining...' : 'Search Jobs'}
  </button>

  {#if error}
    <div class="error">{error}</div>
  {/if}

  {#if refinedQuery}
    <div class="refined">
      <strong>Refined query:</strong> {refinedQuery}
    </div>
  {/if}
</div>
```

---

## Error Handling & Rate Limits

### Common Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| **400** | Bad Request | Check request format, required parameters |
| **401** | Unauthorized | Verify API key is valid |
| **402** | Insufficient credits | Add credits to OpenRouter account |
| **429** | Rate Limited | Implement exponential backoff, wait and retry |
| **502** | Bad Gateway | Provider error - retry with backoff |
| **503** | Service Unavailable | OpenRouter overloaded - retry with backoff |

### Rate Limits

**Free Models** (ending in `:free`):
- 20 requests per minute
- 50 messages per day (increases to 1,000 with $10+ credits)
- Resets at 12:00 AM UTC (7:00 PM EST)

**Grok Models** (paid):
- 4M tokens per minute
- 480 requests per minute

### Rate Limit Headers

```typescript
// Check rate limit status in response
const rateLimitLimit = response.headers.get('X-RateLimit-Limit');
const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
const rateLimitReset = response.headers.get('X-RateLimit-Reset');
```

### Retry Strategy Implementation

```typescript
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;    // milliseconds
  maxDelay: number;     // milliseconds
  retryableStatuses: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryableStatuses: [429, 500, 502, 503, 504]
};

async function fetchWithExponentialBackoff(
  url: string,
  options: RequestInit,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  attempt = 0
): Promise<Response> {
  try {
    const response = await fetch(url, options);

    // Success - return response
    if (response.ok) {
      return response;
    }

    // Don't retry client errors (except 429)
    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      return response;
    }

    // Retry server errors and 429
    if (config.retryableStatuses.includes(response.status) && attempt < config.maxRetries) {
      const delay = Math.min(
        config.baseDelay * Math.pow(2, attempt) + Math.random() * 1000, // Jitter
        config.maxDelay
      );

      console.log(`Retrying after ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));

      return fetchWithExponentialBackoff(url, options, config, attempt + 1);
    }

    return response;

  } catch (networkError) {
    // Network errors - retry
    if (attempt < config.maxRetries) {
      const delay = Math.min(
        config.baseDelay * Math.pow(2, attempt),
        config.maxDelay
      );

      console.log(`Network error, retrying after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));

      return fetchWithExponentialBackoff(url, options, config, attempt + 1);
    }

    throw networkError;
  }
}
```

---

## Streaming Implementation

### Enable Streaming

Set `stream: true` in your request to receive Server-Sent Events (SSE) instead of a single response.

### Server-Side Streaming Endpoint

**Location:** `src/routes/api/stream-refine/+server.ts`

```typescript
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const { query } = await request.json();

  const openRouterResponse = await fetch(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'x-ai/grok-4.1-fast',
        messages: [
          { role: 'system', content: 'Refine search queries.' },
          { role: 'user', content: query }
        ],
        stream: true,
        max_tokens: 150
      })
    }
  );

  // Return SSE stream directly to client
  return new Response(openRouterResponse.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
```

### Client-Side SSE Parsing

```typescript
async function streamRefineQuery(query: string) {
  const response = await fetch('/api/stream-refine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let refinedText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line

      for (const line of lines) {
        // Skip comments and empty lines
        if (line.startsWith(':') || line.trim() === '') continue;

        // Parse data lines
        if (line.startsWith('data: ')) {
          const data = line.slice(6); // Remove "data: " prefix

          // Check for end of stream
          if (data === '[DONE]') {
            console.log('Stream complete');
            return refinedText;
          }

          try {
            const chunk = JSON.parse(data);

            // Check for errors
            if (chunk.error) {
              throw new Error(chunk.error.message);
            }

            // Extract content from delta
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              refinedText += content;
              // Update UI incrementally
              updateUI(refinedText);
            }

            // Check finish reason
            const finishReason = chunk.choices?.[0]?.finish_reason;
            if (finishReason === 'error') {
              throw new Error('Stream ended with error');
            }

          } catch (parseError) {
            console.error('Failed to parse SSE chunk:', parseError);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return refinedText;
}

function updateUI(text: string) {
  // Update your Svelte state
  refinedQuery = text;
}
```

### Using eventsource-parser Library

```bash
npm install eventsource-parser
```

```typescript
import { createParser, type ParsedEvent } from 'eventsource-parser';

async function streamWithParser(query: string) {
  const response = await fetch('/api/stream-refine', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });

  if (!response.body) {
    throw new Error('No response body');
  }

  let refinedText = '';

  const parser = createParser((event: ParsedEvent) => {
    if (event.type === 'event') {
      if (event.data === '[DONE]') {
        console.log('Stream complete');
        return;
      }

      try {
        const chunk = JSON.parse(event.data);
        const content = chunk.choices?.[0]?.delta?.content;

        if (content) {
          refinedText += content;
          updateUI(refinedText);
        }
      } catch (err) {
        console.error('Parse error:', err);
      }
    }
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    parser.feed(decoder.decode(value));
  }

  return refinedText;
}
```

### Stream Cancellation

```typescript
const abortController = new AbortController();

// Start stream
fetch('/api/stream-refine', {
  method: 'POST',
  signal: abortController.signal,
  // ...
});

// Cancel stream (e.g., user clicks "Stop")
abortController.abort();
```

**Note:** Cancellation immediately stops billing for OpenAI, Anthropic providers. Other providers may continue processing.

---

## Production-Ready Examples

### Complete Query Refinement Service

**Location:** `src/lib/services/queryRefiner.ts`

```typescript
export interface QueryRefinerConfig {
  apiKey: string;
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  retryConfig?: RetryConfig;
}

export interface RefineResult {
  original: string;
  refined: string;
  confidence?: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class QueryRefinerService {
  private config: Required<QueryRefinerConfig>;

  constructor(config: QueryRefinerConfig) {
    this.config = {
      model: 'x-ai/grok-4.1-fast',
      systemPrompt: 'You are a search query optimizer for healthcare job searches. Refine queries to be more specific, adding relevant medical terminology and qualifications. Return only the refined query.',
      maxTokens: 150,
      temperature: 0.3,
      retryConfig: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        retryableStatuses: [429, 500, 502, 503]
      },
      ...config
    };
  }

  async refine(query: string): Promise<RefineResult> {
    if (!query?.trim()) {
      throw new Error('Query cannot be empty');
    }

    const response = await this.callOpenRouter({
      model: this.config.model,
      messages: [
        { role: 'system', content: this.config.systemPrompt },
        { role: 'user', content: query }
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'OpenRouter API error');
    }

    const refined = data.choices[0]?.message?.content?.trim();

    if (!refined) {
      throw new Error('No refinement generated');
    }

    return {
      original: query,
      refined,
      usage: data.usage
    };
  }

  private async callOpenRouter(
    body: any,
    attempt = 0
  ): Promise<Response> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://healthcarejobs.ca',
        'X-Title': 'HealthcareJobs Query Refiner'
      },
      body: JSON.stringify(body)
    });

    // Implement retry logic for retryable errors
    if (
      !response.ok &&
      this.config.retryConfig.retryableStatuses.includes(response.status) &&
      attempt < this.config.retryConfig.maxRetries
    ) {
      const delay = Math.min(
        this.config.retryConfig.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
        this.config.retryConfig.maxDelay
      );

      await new Promise(resolve => setTimeout(resolve, delay));
      return this.callOpenRouter(body, attempt + 1);
    }

    return response;
  }
}

// Usage in SvelteKit endpoint
export const POST: RequestHandler = async ({ request }) => {
  const refiner = new QueryRefinerService({
    apiKey: process.env.OPENROUTER_API_KEY!
  });

  const { query } = await request.json();

  try {
    const result = await refiner.refine(query);
    return json(result);
  } catch (err: any) {
    return json({ error: err.message }, { status: 500 });
  }
};
```

---

## Best Practices

### 1. **API Key Security**

```typescript
// ✅ DO: Use environment variables
const apiKey = process.env.OPENROUTER_API_KEY;

// ❌ DON'T: Hardcode keys
const apiKey = "sk-or-v1-...";

// ✅ DO: Validate key exists
if (!apiKey) {
  throw new Error('OPENROUTER_API_KEY not configured');
}

// ✅ DO: Keep keys server-side only (never send to client)
// SvelteKit: Only use in +server.ts or +page.server.ts
```

### 2. **Error Handling**

```typescript
try {
  const response = await fetch(/* ... */);
  const data = await response.json();

  if (!response.ok) {
    // Handle specific error codes
    if (response.status === 429) {
      throw new Error('Rate limit exceeded - please wait');
    }
    throw new Error(data.error?.message || 'API request failed');
  }

  // Validate response structure
  if (!data.choices?.[0]?.message?.content) {
    throw new Error('Invalid response format');
  }

  return data;

} catch (err: any) {
  // Log for debugging
  console.error('OpenRouter error:', {
    message: err.message,
    status: err.status,
    timestamp: new Date().toISOString()
  });

  // Return user-friendly message
  throw new Error('Failed to process request. Please try again.');
}
```

### 3. **Rate Limit Management**

```typescript
// Implement request queuing for high-volume apps
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private requestsPerMinute = 400; // Below 480 limit
  private interval = 60000; // 1 minute

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });

      if (!this.processing) {
        this.process();
      }
    });
  }

  private async process() {
    this.processing = true;
    const batchSize = Math.floor(this.requestsPerMinute / 6); // Process in batches

    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, batchSize);
      await Promise.all(batch.map(fn => fn()));

      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10s between batches
      }
    }

    this.processing = false;
  }
}
```

### 4. **Caching Strategies**

```typescript
// Cache refined queries to reduce API calls
import { browser } from '$app/environment';

const CACHE_KEY = 'refined_queries';
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

interface CacheEntry {
  refined: string;
  timestamp: number;
}

function getCachedRefinement(query: string): string | null {
  if (!browser) return null;

  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const entry: CacheEntry = cache[query];

    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
      return entry.refined;
    }
  } catch {
    return null;
  }

  return null;
}

function setCachedRefinement(query: string, refined: string) {
  if (!browser) return;

  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    cache[query] = {
      refined,
      timestamp: Date.now()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('Failed to cache refinement:', err);
  }
}
```

### 5. **Model Selection Logic**

```typescript
function selectOptimalModel(taskType: string, requiresTools: boolean): string {
  if (requiresTools || taskType === 'agentic') {
    return 'x-ai/grok-4.1-fast'; // Better for tool calling
  }

  if (taskType === 'simple-refinement') {
    return 'x-ai/grok-4-fast'; // Cost-efficient
  }

  // Default to 4.1 for better factuality
  return 'x-ai/grok-4.1-fast';
}
```

### 6. **Monitoring & Logging**

```typescript
interface RequestMetrics {
  requestId: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  timestamp: string;
  success: boolean;
  error?: string;
}

async function logRequest(metrics: RequestMetrics) {
  // Send to your analytics/monitoring service
  await fetch('/api/metrics', {
    method: 'POST',
    body: JSON.stringify(metrics)
  });
}

// Usage
const startTime = Date.now();
try {
  const result = await refiner.refine(query);

  await logRequest({
    requestId: crypto.randomUUID(),
    model: 'x-ai/grok-4.1-fast',
    ...result.usage!,
    latency_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    success: true
  });

} catch (err) {
  await logRequest({
    requestId: crypto.randomUUID(),
    model: 'x-ai/grok-4.1-fast',
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    latency_ms: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    success: false,
    error: err.message
  });
}
```

### 7. **Cost Optimization**

```typescript
// Calculate costs before making requests
function estimateCost(prompt: string, maxTokens: number, model: string): number {
  const inputTokens = Math.ceil(prompt.length / 4); // Rough estimate
  const outputTokens = maxTokens;

  // Grok 4/4.1 Fast pricing
  const inputCost = inputTokens > 128000 ? 0.40 : 0.20;  // per 1M tokens
  const outputCost = outputTokens > 128000 ? 1.00 : 0.50; // per 1M tokens

  const cost = (inputTokens / 1000000 * inputCost) + (outputTokens / 1000000 * outputCost);

  return cost;
}

// Set budget limits
const MONTHLY_BUDGET = 50.00; // $50/month
let currentSpend = 0;

function checkBudget(estimatedCost: number): boolean {
  if (currentSpend + estimatedCost > MONTHLY_BUDGET) {
    throw new Error('Monthly budget exceeded');
  }
  return true;
}
```

### 8. **Testing**

```typescript
// Mock OpenRouter for tests
export function createMockOpenRouter(responses: any[]) {
  let callCount = 0;

  return {
    fetch: async (url: string, options: RequestInit) => {
      const response = responses[callCount++] || responses[responses.length - 1];

      return new Response(JSON.stringify(response), {
        status: response.status || 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  };
}

// Unit test
import { describe, it, expect } from 'vitest';

describe('QueryRefinerService', () => {
  it('refines query successfully', async () => {
    const mockResponses = [{
      choices: [{
        message: {
          content: 'Registered Nurse ICU Toronto'
        }
      }],
      usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 }
    }];

    const service = new QueryRefinerService({
      apiKey: 'test-key',
      fetchFn: createMockOpenRouter(mockResponses).fetch
    });

    const result = await service.refine('nurse job toronto');

    expect(result.refined).toBe('Registered Nurse ICU Toronto');
    expect(result.usage?.total_tokens).toBe(60);
  });
});
```

---

## Additional Resources

### Documentation Links

- [OpenRouter API Reference](https://openrouter.ai/docs/api/reference/overview)
- [OpenRouter Authentication](https://openrouter.ai/docs/api/reference/authentication)
- [OpenRouter Streaming](https://openrouter.ai/docs/api/reference/streaming)
- [OpenRouter Error Handling](https://openrouter.ai/docs/api/reference/errors-and-debugging)
- [xAI Grok Models & Pricing](https://docs.x.ai/docs/models)
- [xAI Consumption & Rate Limits](https://docs.x.ai/docs/key-information/consumption-and-rate-limits)
- [Grok 4.1 Fast Announcement](https://x.ai/news/grok-4-1-fast)
- [SvelteKit Routing Documentation](https://kit.svelte.dev/docs/routing)
- [SvelteKit Load Functions](https://kit.svelte.dev/docs/load)

### OpenRouter Model Pages

- [Grok 4 Fast on OpenRouter](https://openrouter.ai/x-ai/grok-4-fast)
- [Grok 4.1 Fast on OpenRouter](https://openrouter.ai/x-ai/grok-4.1-fast)
- [xAI Provider Page](https://openrouter.ai/provider/xai)

### Community Resources

- [OpenRouter GitHub](https://github.com/OpenRouterTeam)
- [SvelteKit Error Handling Discussions](https://github.com/sveltejs/kit/discussions/6499)
- [Using Fetch with SvelteKit](https://rodneylab.com/using-fetch-sveltekit/)

---

## Summary

This guide provides comprehensive documentation for integrating OpenRouter's API with xAI's Grok Fast models in a SvelteKit application. Key takeaways:

1. **Grok 4.1 Fast** is recommended for agentic tasks requiring tools, with 50% lower hallucination rates
2. **Grok 4 Fast** is suitable for cost-efficient general reasoning without tool calling
3. Implement **exponential backoff** for 429/5xx errors
4. Use **server-side endpoints** (+server.ts) to protect API keys
5. Enable **streaming** for real-time user experiences
6. **Cache** frequently used refinements to reduce costs
7. **Monitor** token usage and costs with proper logging

Both models are actively maintained with no deprecation plans as of January 2026.

---

**Document Version:** 1.0
**Last Updated:** January 22, 2026
**Maintained by:** Healthcare Jobs Development Team
