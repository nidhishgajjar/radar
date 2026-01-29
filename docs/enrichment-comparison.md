# Radar vs Clay vs Sales Navigator

## AI-Qualified Prospect Intelligence

---

## The Problem with Raw Data

| | Clay | Sales Navigator | Radar |
|---|---|---|---|
| **What you get** | 1000 raw records | List of profiles | **50 AI-qualified prospects** |
| **Your work** | Manually review all 1000 | Hours of clicking | **Done - ready to contact** |
| **Data quality** | Cached (weeks old) | Real-time profiles | **Real-time web + AI filtered** |

**Clay gives you data. Sales Navigator gives you profiles. Radar gives you qualified prospects.**

---

## What Makes Radar Different

| | **Radar** | **Clay** | **Sales Navigator** |
|---|---|---|---|
| **Primary Function** | Discovery + AI Qualification | Enrichment only | Discovery only |
| **AI Filtering** | Yes - fit scoring | No | No |
| **Output** | Qualified prospects only | Raw data dumps | Profile lists |
| **Data Freshness** | **Real-time web** | Cached (weekly/monthly) | Real-time (LinkedIn only) |

**You only pay for prospects that match your criteria.**

---

## AI Qualification

Radar uses AI to analyze every prospect and provide:

| Feature | Description |
|---------|-------------|
| **Fit Score (0-100)** | How well they match your search criteria |
| **Key Highlights** | AI-generated summary of why they're a good fit |
| **Recently Left** | Detects candidates who recently changed jobs |
| **Company Signals** | Funding, layoffs, acquisitions, leadership changes |

**Result:** Instead of 1000 records to sort through, you get 50-200 high-fit prospects ready for outreach.

---

## Real-Time Signals

| Signal | **Radar** | **Clay** | **Sales Nav** |
|---|---|---|---|
| New funding rounds | **Live** | Delayed (weeks) | No |
| Leadership changes | **Live** | Delayed | Live |
| Layoffs / hiring surges | **Live** | Delayed | Partial |
| "Recently left" detection | **Live** | No | No |
| Acquisitions | **Live** | Delayed | No |
| Company news | **Live** | No | No |

**Why it matters:** Time-sensitive signals (layoffs, funding) are useless if you find out weeks later.

---

## Data Included

| Data Point | **Radar** | **Clay** | **Sales Navigator** |
|---|---|---|---|
| Find matching prospects | Yes | No | Yes (manual) |
| AI fit scoring | **Yes** | No | No |
| Key highlights | **Yes** | No | No |
| Employee count | Yes | Yes | Yes |
| Revenue | Yes | Yes | No |
| Funding | Yes (live) | Yes (delayed) | No |
| Industry | Yes | Yes | Yes |
| Recently left role | **Yes** | No | No |
| Email addresses | No | Yes | No |
| Phone numbers | No | Yes | No |
| Bulk CSV export | Yes | Yes | No |

---

## Pros & Cons

### Radar

| Pros | Cons |
|------|------|
| **AI qualification** - only qualified prospects | No emails/phones |
| Real-time signals (funding, layoffs, news) | Newer platform |
| Pay-per-use (no monthly commitment) | |
| "Recently left" detection | |
| Company enrichment included | |

### Clay

| Pros | Cons |
|------|------|
| Rich contact data (emails, phones) | **No AI filtering** - raw data only |
| Multi-provider waterfall | No prospect discovery |
| CRM integrations | Cached/stale data |
| | $149+/mo minimum |

### LinkedIn Sales Navigator

| Pros | Cons |
|------|------|
| Direct LinkedIn data | **No AI filtering** |
| InMail outreach | Manual review required |
| Real-time profiles | No bulk export |
| | No company financials |

---

## Use Case Recommendations

| Use Case | Best Option | Why |
|----------|-------------|-----|
| **Quality over quantity** | **Radar** | AI filters out noise |
| **Recruiting / talent sourcing** | **Radar** | "Recently left" + fit scoring |
| **Time-sensitive outreach** | **Radar** | Real-time funding/layoff signals |
| **Need emails/phones** | Clay | Contact data focus |
| **Direct LinkedIn outreach** | Sales Navigator | InMail integration |

---

## Cost Comparison

| | **Radar** | **Clay** | **Sales Navigator** |
|---|---|---|---|
| **Pricing model** | Pay per use | Credits/month | Subscription |
| **Monthly base** | $0 | $149-800/mo | $80-150/mo |
| **500 prospects** | **~$3-5** | ~$150-250* | N/A (manual) |
| **1000 prospects** | **~$6-10** | ~$300-500* | N/A |
| **What you get** | AI-qualified + enriched | Raw records to review | Profile lists |

*Clay: 4-10 credits per record, Starter=$149/2K credits, Explorer=$349/10K credits*

### Radar Cost Breakdown

**Exa API Pricing:**
| Component | Cost per 1000 |
|-----------|---------------|
| Search (1-25 results) | $5 |
| Search (26-100 results) | $25 |
| **Text extraction** | **$1 per 1000 pages** |

**Optimization:** We use 2-step search (search without text → dedup → fetch text for unique only) to save ~24% on text costs.

**LLM Pricing (Grok 4.1 Fast via OpenRouter):**
- $0.20 per 1M input tokens
- $0.50 per 1M output tokens
- ~$0.0007 per candidate filtered

### Example: "Canadian DTC/Ecommerce Founders, 50+ employees, $10M+ revenue"

| Component | Units | Rate | Cost |
|-----------|-------|------|------|
| **Candidate Search** | 22 queries × 100 results | $0.025/query | $0.55 |
| **Text Extraction** | 1166 unique profiles | $0.001/page | $1.17 |
| **Company Enrichment** | 598 companies × 5 results | $0.01/search | $5.98 |
| **AI Filtering** | 1166 candidates | ~$0.0007/each | $0.78 |
| **Total** | | | **~$8.48** |

**Result:** 2200 raw → 1166 unique → **678 qualified** prospects

- 44% have verified revenue data
- 18% have verified headcount data
- 42 candidates meet **both** 50+ employees AND $10M+ revenue with verified data

**Cost per qualified prospect: ~$0.013**

*Company data (headcount, revenue) available to LLM during filtering for criteria-based qualification*

---

## Summary

**Radar is the only platform that combines:**
1. Prospect discovery (find people matching criteria)
2. **AI qualification** (filter for fit score)
3. Company enrichment (headcount, revenue, funding)
4. Real-time signals (layoffs, acquisitions, leadership changes)

**The difference:**
- Clay = 1000 records you have to review
- Radar = 100 qualified prospects ready to contact

**Best for teams who need:**
- Quality over quantity
- Pre-qualified prospects, not data dumps
- Real-time signals for timely outreach
- "Recently left" detection for recruiting

---

*Radar - AI-Qualified Prospect Intelligence*
