# 🎬 Personal Media Tracker

A self-hosted personal media tracker to manage your watch history, backed by a local SQLite database and powered by TMDB & Simkl.

![Media Tracker UI](https://img.shields.io/badge/UI-Dark%20Glassmorphism-6c63ff?style=flat-square) ![SQLite](https://img.shields.io/badge/DB-SQLite-003b57?style=flat-square) ![TypeScript](https://img.shields.io/badge/Stack-React%20%2B%20Express-3178c6?style=flat-square)

## Features

- **� Local Library** — Your data lives in a local `library.db` (SQLite). You own your data.
- **🔍 Metadata Search** — Integrated search for Movies & TV (TMDB) and Anime (Jikan/MAL).
- **➕ Add to Library** — Search and add titles with one click (Plan to Watch, Watching, Completed, etc.).
- **� Simkl Import** — One-time import to sync your existing Simkl history into your local database.
- **📊 Media Browser** — Full-page poster grid with filtering by type, status, year, and genre.
- **⬇ Data Export** — Export your library to CSV (Raw or Trakt-compatible formats).
- **🖼️ Poster Management** — Choose between **TMDB** (High Quality) or **RPDB** (with ratings) for your library posters.
- **🚀 Single Server** — Backend serves the React frontend—just run one command.

## Tech Stack

- **Frontend**: React, Vite, Vanilla CSS (Dark Glassmorphism)
- **Backend**: Express, better-sqlite3 (SQLite)
- **Providers**: TMDB API, Jikan API (Unofficial MAL)

## Getting Started

### Prerequisites

- Node.js v18+
- TMDB API Key (Get one free at [themoviedb.org](https://www.themoviedb.org/settings/api))
- (Optional) Simkl Client ID/Secret if you want to import history

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
   cd ..
   ```

3. **Build Frontend**
   ```bash
   cd client && npm run build
   ```

4. **Configure Environment**
   Create `server/.env`:
   ```bash
   PORT=3000
   TMDB_API_KEY=your_tmdb_api_key
   # Optional: Only needed for Simkl Import
   SIMKL_CLIENT_ID=...
   SIMKL_CLIENT_SECRET=...
   SIMKL_REDIRECT_URI=http://localhost:3000
   # Optional: For Rated Posters
   RPDB_API_KEY=your_rpdb_key
   ```

5. **Run**
   ```bash
   make start
   ```
   Or use the manual commands:
   ```bash
   cd server && npm run dev
   ```
   Open **http://localhost:3000**.

## Quick Start (Makefile)

If you have `make` installed:
1. `make install` - Install dependencies
2. `make build` - Build the frontend
3. `make start` - Run the server

Or just run `make` to do all three in sequence.

## Data Location

Your library is stored in `server/data/library.db`. 
- **Backup**: Just copy this file.
- **Inspect**: Use any SQLite viewer (e.g., `sqlite3`, DB Browser for SQLite).

## API Documentation

- `GET /api/search?q=...&type=...` — Search TMDB/Jikan
- `GET /api/library` — Get all items
- `POST /api/library` — Add item
- `PATCH /api/library/:id` — Update item
- `DELETE /api/library/:id` — Remove item
- `POST /api/library/import/simkl` — Import from Simkl
- `GET /api/export/csv` — Download CSV

## License

MIT
