# Healthcare Jobs - People Search

AI-powered people search application built with SvelteKit and Exa's People Search API. Find healthcare professionals by role, expertise, location, or organization.

## Features

- 🔍 **Semantic Search**: Natural language queries powered by Exa AI
- ⚡ **Fast & Responsive**: Built with SvelteKit for optimal performance
- 🎨 **Clean Design**: Minimalist interface inspired by Exa's design language
- 🔒 **Secure**: API keys protected server-side, never exposed to client
- 📱 **Mobile-Friendly**: Responsive design works on all devices

## Tech Stack

- **Framework**: SvelteKit 2.0
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Custom CSS
- **API**: Exa AI People Search API
- **Package Manager**: npm

## Prerequisites

- Node.js 18+ installed
- Exa API key (get one at [exa.ai](https://exa.ai))

## Installation

1. **Clone or navigate to the project**

```bash
cd healthcarejobs
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

Copy `.env.example` to `.env` and add your Exa API key:

```bash
cp .env.example .env
```

Edit `.env` and replace with your actual API key:

```env
EXA_API_KEY=your_actual_api_key_here
PUBLIC_APP_NAME=Healthcare Jobs - People Search
```

4. **Run the development server**

```bash
npm run dev
```

5. **Open your browser**

Navigate to [http://localhost:5173](http://localhost:5173)

## Usage

### Example Searches

Try these example queries:

- "Senior nurses at Mayo Clinic"
- "Healthcare data scientists in Boston"
- "Medical directors at pharmaceutical companies"
- "Chief medical officers in New York"
- "Biotech researchers at Moderna"

### API Endpoint

The search API is available at:

```
POST /api/search/people
```

**Request Body:**

```json
{
  "query": "Senior engineers at Google",
  "page": 1
}
```

**Response:**

```json
{
  "requestId": "...",
  "results": [
    {
      "id": "...",
      "title": "Person Name - Role",
      "url": "https://...",
      "text": "Profile description...",
      "author": "...",
      "score": 0.95
    }
  ],
  "searchType": "auto"
}
```

**Error Responses:**

- `400`: Invalid query (missing or too short)
- `429`: Rate limit exceeded
- `500`: Server error
- `503`: Network error
- `504`: Request timeout

## Project Structure

```
healthcarejobs/
├── src/
│   ├── lib/
│   │   ├── server/
│   │   │   └── exa-wrapper.ts      # Exa API wrapper class
│   │   └── types/
│   │       └── exa.ts              # TypeScript types
│   ├── routes/
│   │   ├── +page.svelte            # Homepage
│   │   ├── +layout.svelte          # Root layout
│   │   └── api/
│   │       └── search/
│   │           └── people/
│   │               └── +server.ts  # Search API endpoint
│   ├── components/
│   │   ├── SearchBar.svelte        # Search input
│   │   ├── PersonCard.svelte       # Result card
│   │   ├── LoadingState.svelte     # Skeleton loader
│   │   ├── ErrorMessage.svelte     # Error display
│   │   └── EmptyState.svelte       # No results state
│   ├── app.html                    # HTML template
│   └── app.css                     # Global styles
├── static/                         # Static assets
├── .env                            # Environment variables (gitignored)
├── .env.example                    # Environment template
├── package.json                    # Dependencies
├── svelte.config.js                # SvelteKit config
├── tailwind.config.js              # Tailwind config
└── tsconfig.json                   # TypeScript config
```

## Building for Production

Build the production version:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `EXA_API_KEY` | Your Exa API key | Yes |
| `PUBLIC_APP_NAME` | Application name | No |

**Important:** Only variables prefixed with `PUBLIC_` are exposed to the client. Keep sensitive keys private.

## Design Language

The app follows Exa's minimalist design principles:

- **Color Palette**: Navy to electric blue spectrum (#0A1628 → #5AB9EA)
- **Typography**: Inter font family for clean, modern text
- **Layout**: Card-based results with subtle grid overlays
- **Spacing**: Generous whitespace for readability

## Security

- ✅ API keys stored server-side only
- ✅ Input validation on all queries
- ✅ Error messages don't expose internals
- ✅ CORS handled by SvelteKit
- ✅ Type-safe TypeScript throughout

## Performance

- ⚡ Server-side rendering (SSR) for fast initial load
- ⚡ Debounced search (300ms) reduces API calls
- ⚡ Optimized bundle size with Vite
- ⚡ Responsive images and lazy loading

## Contributing

This is a simplified MVP. Future enhancements could include:

- Redis caching for faster repeat queries
- Rate limiting per user/IP
- Pagination for large result sets
- Advanced filters (location, role, company)
- Save/favorite profiles
- Export results to CSV

## License

ISC

## Acknowledgments

- Built with [SvelteKit](https://kit.svelte.dev/)
- Powered by [Exa AI](https://exa.ai)
- Styled with [Tailwind CSS](https://tailwindcss.com)
