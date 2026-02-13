# 🎬 Simkl Exporter

Export and browse your [Simkl](https://simkl.com) watch history — with poster artwork, filters, and CSV download in multiple formats.

![Dark UI with glassmorphism design](https://img.shields.io/badge/UI-Dark%20Glassmorphism-6c63ff?style=flat-square) ![TypeScript](https://img.shields.io/badge/TypeScript-React%20%2B%20Express-3178c6?style=flat-square)

## Features

- **📋 Media Browser** — Full-page poster grid showing your movies, shows, and anime with artwork, ratings, genres, and status badges
- **🔍 5 Filters** — Search by title, filter by type (movie/show/anime), year, status (completed/watching/plan to watch/on hold/dropped), and genre
- **📄 Pagination** — Configurable page size (12, 24, 48, 96 per page)
- **⬇ CSV Export** — Download your history as a CSV file with an extensible transformer system:
  - **Raw** — All 20 fields from Simkl
  - **Trakt** — Trakt-compatible format for easy import
- **🔒 Persistent Sessions** — Stays connected across page refreshes (token stored in localStorage)
- **↻ Refresh** — Re-pull data from Simkl without re-authenticating
- **🎨 Dark Glassmorphism UI** — Responsive design with poster hover effects, color-coded type badges, and animated status pills

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript, Vite |
| Backend | Express + TypeScript |
| Styling | Vanilla CSS (dark glassmorphism) |
| API | Simkl API (OAuth 2.0) |

## Getting Started

### Prerequisites

- Node.js v18+
- A [Simkl API app](https://simkl.com/settings/developer/) with Client ID + Secret

### Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/silverrajat88/media-tracker.git
   cd media-tracker
   ```

2. **Install dependencies**
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

3. **Configure environment**
   ```bash
   # server/.env
   SIMKL_CLIENT_ID=your_client_id
   SIMKL_CLIENT_SECRET=your_client_secret
   SIMKL_REDIRECT_URI=http://localhost:3000
   PORT=3001
   ```

4. **Run**
   ```bash
   # Terminal 1 — Backend
   cd server && npm run dev

   # Terminal 2 — Frontend
   cd client && npx vite --port 3000
   ```

5. Open **http://localhost:3000**, connect to Simkl, and browse your library!

## Adding New Export Formats

The transformer architecture makes it easy to add new service formats:

1. Create a new file in `server/src/transformers/` (e.g., `letterboxd.ts`)
2. Export a transformer function that maps `SimklRow[]` → `{ headers, rows, filename }`
3. Register it in `server/src/transformers/index.ts`

## License

MIT
