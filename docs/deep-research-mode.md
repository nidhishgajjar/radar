# Deep Research Mode - Feature Spec

## Overview

A proactive, intent-driven search mode that expands user intent into comprehensive candidate sourcing across multiple dimensions.

## Key Insight

**Exa Research API ≠ Candidate Sourcing**

| API | Returns | Use Case |
|-----|---------|----------|
| Exa Research | Synthesized report/answer | Market analysis, fact-checking |
| Exa Search | List of profile results | Candidate sourcing (what we use) |

Deep Research Mode uses **Exa Search API** with smart orchestration, not Exa Research.

---

## Architecture

```
User Intent: "litigation partners who might be open to moving"
                         ↓
              ┌─────────────────────┐
              │   Intent Parser     │  ← LLM extracts:
              │                     │    - Core role
              │                     │    - Implicit criteria
              │                     │    - Expansion opportunities
              └─────────────────────┘
                         ↓
              ┌─────────────────────┐
              │   Ask User About    │  ← "I can expand this search by:"
              │   Variants          │    - Geographic (50 cities vs 5)
              │                     │    - Role variants (Partner, Counsel, Senior Associate)
              │                     │    - Industry verticals
              │                     │    - Seniority levels
              └─────────────────────┘
                         ↓
              ┌─────────────────────┐
              │   Generate Search   │  ← Creates N search queries
              │   Plan              │    based on user selections
              └─────────────────────┘
                         ↓
              ┌─────────────────────┐
              │   Exa Search API    │  ← Multiple parallel calls
              │   (category: people)│    with progress updates
              └─────────────────────┘
                         ↓
              ┌─────────────────────┐
              │   Dedupe + Filter   │  ← LLM scoring
              │   + Score + Rank    │
              └─────────────────────┘
                         ↓
                  Comprehensive Results
```

---

## User Flow

### Step 1: Intent Input
User enters natural language intent:
- "Toronto based retired legal recruiters"
- "Startup CTOs in Canada"
- "Healthcare executives open to relocation"

### Step 2: System Suggests Expansions
System identifies expansion opportunities and asks user:

```
I can expand your search across these dimensions:

[ ] Geographic
    ○ Toronto only
    ○ GTA (Toronto + suburbs)
    ○ Ontario major cities
    ○ All Canadian metros
    ○ Custom list...

[ ] Role Variants
    ○ Exact match only
    ○ Include related titles (Legal Recruiter, Executive Search - Legal, etc.)

[ ] Filters
    ○ Company size
    ○ Years of experience
    ○ Recent job changes
    ○ Custom criteria...
```

### Step 3: Execution with Progress
- Shows real-time progress
- "Searching Vancouver... found 23"
- "Searching Calgary... found 8"
- User can stop anytime and get partial results

### Step 4: Results
- Deduplicated candidate list
- Sorted by relevance/fit score
- Exportable to CSV
- Summary stats (total found, by city, by criteria)

---

## Expansion Dimensions

### Geographic
- Single city → Province → Country → Custom list
- Pre-built lists:
  - Canadian Tier 1 cities (1M+): Toronto, Montreal, Vancouver, Calgary, Edmonton, Ottawa
  - Canadian Tier 2 (200K-1M): Winnipeg, Quebec City, Hamilton, Kitchener, London, Victoria, Halifax
  - US Tech Hubs: SF, NYC, Seattle, Austin, Boston, LA, Denver, Chicago
  - Custom user-defined lists

### Role Variants
- Exact title match
- Related titles (LLM-generated)
- Seniority expansion (Director → VP → C-level)
- Function expansion (Marketing → Growth → Brand)

### Industry Verticals
- Broad → Specific (Tech → SaaS → B2B SaaS → DevTools)
- Adjacent industries

### Company Attributes
- Size (Startup, SMB, Enterprise)
- Stage (Seed, Series A-D, Public)
- Industry focus

### Temporal Filters
- Recent job changes (last 6 months)
- Long tenure (7+ years, might be ready to move)
- Recently promoted (not looking)
- Profile activity signals

---

## Exa Research API - Potential Uses

While not for sourcing, Exa Research could enhance the experience:

| Use Case | How |
|----------|-----|
| Pre-search intelligence | "What are the top legal recruiting firms in Canada?" |
| Market context | "What's the typical career path for litigation partners?" |
| Validation | "Is [specific person] actually retired?" |
| Competitive intel | "What companies are hiring litigation partners in Toronto?" |

---

## Technical Considerations

### Cost Estimation
- Show estimated cost before running
- "This will run ~200 searches across 50 cities × 4 query variants"
- Allow user to reduce scope

### Rate Limiting
- Exa has rate limits
- Need queuing/throttling for large expansions
- Consider batch processing for very large searches

### Deduplication
- Same person appears in multiple city searches
- Same person matches multiple role variants
- Use URL-based dedup (LinkedIn URL is unique identifier)

### Progress & Interruptibility
- Real-time progress updates
- User can stop anytime
- Partial results are still valuable

---

## UX Principles

1. **User Controls Expansion** - System suggests, user decides
2. **Transparent** - Show what's being searched and why
3. **Interruptible** - Stop anytime, keep partial results
4. **Cost-Aware** - Estimate before running
5. **Explainable** - "Found 500 because you selected 50 cities × ~10 results each"

---

## Example Scenarios

### Scenario 1: Geographic Expansion
```
User: "litigation partner Toronto"
System: "Want to expand to other cities?"
User: Selects "All Canadian metros"
Result: 500 candidates across 20 cities
```

### Scenario 2: Role Expansion
```
User: "CTO at startups"
System: "Include related roles?"
User: Selects "VP Engineering, Head of Engineering, Technical Co-founder"
Result: 3x more candidates
```

### Scenario 3: Combined Expansion
```
User: "healthcare executives"
System: "I can expand by:"
  - Geography: User selects "US + Canada"
  - Roles: User selects "CEO, COO, CFO, CMO"
  - Verticals: User selects "Hospitals, Pharma, MedTech"
Result: Comprehensive market map
```

---

## Future Enhancements

- **Saved Searches** - Re-run with one click
- **Monitoring** - Alert when new matches appear
- **Comparison Mode** - Side-by-side candidate comparison
- **Market Reports** - Auto-generated market analysis using Exa Research
- **Pipeline Integration** - Push to ATS/CRM

---

## References

- [Exa Research API Docs](https://exa.ai/docs/reference/exa-research)
- [Exa 2.1 Announcement](https://exa.ai/blog/exa-api-2-1)
- [Exa People Search Benchmark](https://exa.ai/blog/people-search-benchmark)
- [Geolocation Filter](https://exa.ai/docs/changelog/geolocation-filter-support)
