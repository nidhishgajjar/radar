---
date: 2026-01-22
topic: radar-product-vision
---

# Radar by jobs.ca - Product Vision

## What We're Building

**Radar** is a standalone talent intelligence platform for employers, powered by Exa AI's People Search API. It's positioned as jobs.ca's premium employer offering for finding, mapping, and reaching out to talent across all industries.

## Product Identity

**Name:** Radar by jobs.ca
**Positioning:** Standalone brand with "Powered by jobs.ca" tagline
**Target:** Recruiters, HR teams, hiring managers across all industries

**Design Inspiration:** Exa AI's clean, modern aesthetic
- Navy blue primary (#0A1628)
- Electric blue accent (#4A90E2)
- Clean white space
- No gradients - solid colors only
- Exa-like visual richness

## Core Features (MVP - v1)

### Search Experience (Exa-inspired agentic feel)
1. **Natural language search** - "Find senior data scientists in Toronto"
2. **Canada-only results** - `userLocation: "ca"` to save credits
3. **Search on Enter** - No search button (clean interface)
4. **Smart examples** - Clickable example queries to guide users
5. **Instant results** - 20 results per search

### Results Display
1. **Rich profile cards**
   - Profile picture (from Exa)
   - Name + Position
   - Company name
   - Location
   - Snippet of profile text (markdown rendered)

2. **Full profile modal**
   - Complete work history (markdown rendered)
   - Education
   - Skills
   - About section
   - LinkedIn profile link

### Data from Exa People API
- ✅ Name
- ✅ Current position/title
- ✅ Company name & location
- ✅ Person location
- ✅ Profile picture URL
- ✅ LinkedIn URL
- ✅ Full profile text (work history, education, skills, about)

### What We Don't Get (Yet)
- ❌ Company logos (would need separate API/scraping)
- ❌ Email addresses
- ❌ Phone numbers

## Coming Soon Features (v2)

**"Reach Out" Capabilities:**
1. Contact enrichment (email/phone via integrations)
2. **Direct outreach from Radar**:
   - "Reach out via LinkedIn" button
   - "Reach out via Email" button
   - "Reach out via Phone" button
3. Radar handles the outreach flow, not just enrichment

## Design Principles (Exa-inspired)

### Visual Design
- **Colors:** Navy + electric blue (no gradients)
- **Typography:** Modern sans-serif (SF Pro Display)
- **Spacing:** Generous white space
- **Icons:** Clean SVG icons (not emojis)
- **Cards:** Subtle shadows, clean borders
- **Visual richness:** Profile pictures, company context

### UX Principles
1. **Intelligent search** - Natural language queries work seamlessly
2. **Instant feedback** - Loading states, smooth transitions
3. **Guided discovery** - Example queries, suggestions
4. **Minimal friction** - Search on Enter, no unnecessary clicks
5. **Visual clarity** - Clean hierarchy, obvious actions

### Agentic Feel
- Make it feel like the search "understands" intent
- Natural language queries work naturally
- Results feel curated and relevant
- Smooth, intelligent interactions

## Technical Implementation

### Architecture
- SvelteKit 2.0 + TypeScript
- Exa AI People Search API (exa-js SDK)
- Server-side API wrapper at `/api/search/people`
- Markdown rendering for profiles
- Component-based UI

### Key Parameters
```typescript
exa.searchAndContents(query, {
  category: 'people',
  numResults: 20,
  text: true,
  type: 'auto',
  userLocation: 'ca' // Canada only
})
```

### Components
- SearchBar (no button, Enter to search)
- PersonCard (rich card with picture, markdown snippet)
- ProfileModal (full profile with markdown rendering)
- LoadingState (clean spinner)
- EmptyState (with example queries)
- ErrorMessage (clean error display)

## Success Metrics

**For MVP:**
- Clean, professional UI that feels premium
- Fast search (<2s response time)
- High-quality Canada-focused results
- Smooth, intuitive UX

**For v2:**
- Contact enrichment accuracy
- Outreach success rates
- User engagement with "Reach Out" features

## Next Steps

1. ✅ Brainstorm complete - Vision aligned
2. → Implement navy + blue color scheme (no gradients)
3. → Remove search button (Enter only)
4. → Add visual richness (better cards, profile pictures)
5. → Improve markdown rendering
6. → Add "Coming Soon" badge for outreach features
7. → Polish agentic feel (smooth interactions, visual feedback)

---

**Status:** Ready for implementation
**Next:** Apply Exa-inspired design to all components
