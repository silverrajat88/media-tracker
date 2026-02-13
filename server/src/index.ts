import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import type { MediaItem } from './db/db.js';
import { SQLiteRepository } from './db/sqlite.js';
import { searchTMDB, getTMDBMovie, getTMDBShow } from './providers/tmdb.js';
import { searchAnime } from './providers/jikan.js';
import type { SimklRow } from './types.js';
import { SIMKL_ROW_HEADERS } from './types.js';
import { getTransformer, getAvailableFormats } from './transformers/index.js';

const app = express();
app.use(cors());
app.use(express.json());

const {
    SIMKL_CLIENT_ID,
    SIMKL_CLIENT_SECRET,
    SIMKL_REDIRECT_URI,
    PORT = '3000',
} = process.env;

// Initialize repository
const repo = new SQLiteRepository();
repo.init();

// Serve static frontend
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, '../../client/dist');
app.use(express.static(CLIENT_DIST));


// ---------- helpers ----------

async function simklRequest(url: string, token: string) {
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            'simkl-api-key': SIMKL_CLIENT_ID!,
        },
    });
    if (!res.ok) throw new Error(`Simkl API error ${res.status}: ${await res.text()}`);
    return res.json();
}

function escapeCSV(value: string): string {
    if (!value) return '';
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

function s(val: any): string {
    if (val === null || val === undefined) return '';
    return String(val);
}

function rowsToCSV(headers: string[], rows: Record<string, string>[]): string {
    const lines = [headers.join(',')];
    for (const row of rows) {
        lines.push(headers.map((h) => escapeCSV(row[h] ?? '')).join(','));
    }
    return lines.join('\n');
}

// ---------- auth routes ----------

app.get('/api/auth/simkl-url', (_req, res) => {
    const url = `https://simkl.com/oauth/authorize?response_type=code&client_id=${SIMKL_CLIENT_ID}&redirect_uri=${encodeURIComponent(SIMKL_REDIRECT_URI!)}`;
    res.json({ url });
});

app.post('/api/auth/callback', async (req, res) => {
    const { code } = req.body;
    if (!code) { res.status(400).json({ error: 'Missing code' }); return; }

    try {
        const tokenRes = await fetch('https://api.simkl.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                client_id: SIMKL_CLIENT_ID,
                client_secret: SIMKL_CLIENT_SECRET,
                redirect_uri: SIMKL_REDIRECT_URI,
                grant_type: 'authorization_code',
            }),
        });

        if (!tokenRes.ok) {
            const text = await tokenRes.text();
            res.status(tokenRes.status).json({ error: text });
            return;
        }

        const tokenData = await tokenRes.json();
        res.json({ access_token: tokenData.access_token });
    } catch (err: any) {
        console.error('Auth callback error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- search routes ----------

app.get('/api/search', async (req, res) => {
    const query = (req.query.q as string) ?? '';
    const type = req.query.type as string | undefined;

    if (!query || query.length < 2) {
        res.json([]);
        return;
    }

    try {
        const results: any[] = [];

        // Search TMDB for movies and shows
        if (!type || type === 'movie' || type === 'show') {
            const tmdbType = type === 'movie' ? 'movie' : type === 'show' ? 'show' : undefined;
            const tmdbResults = await searchTMDB(query, tmdbType);
            results.push(...tmdbResults);
        }

        // Search Jikan for anime
        if (!type || type === 'anime') {
            try {
                const animeResults = await searchAnime(query);
                results.push(...animeResults);
            } catch (err: any) {
                console.warn('Jikan search failed:', err.message);
            }
        }

        res.json(results);
    } catch (err: any) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- library routes ----------

app.get('/api/library', (req, res) => {
    const filters = {
        type: req.query.type as string | undefined,
        status: req.query.status as string | undefined,
        year: req.query.year ? Number(req.query.year) : undefined,
        genre: req.query.genre as string | undefined,
        search: req.query.search as string | undefined,
    };

    const items = repo.getAll(filters);
    res.json(items);
});

app.get('/api/library/stats', (_req, res) => {
    res.json(repo.getStats());
});

app.get('/api/library/:id', (req, res) => {
    const item = repo.getById(req.params.id);
    if (!item) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(item);
});

app.post('/api/library', async (req, res) => {
    try {
        const body = req.body;
        let enriched = body;

        // If we have a tmdbId, fetch full details for enrichment
        if (body.tmdbId && !body.genres?.length) {
            try {
                const details = body.type === 'movie'
                    ? await getTMDBMovie(body.tmdbId)
                    : await getTMDBShow(body.tmdbId);
                enriched = { ...details, ...body }; // body overrides (e.g. status)
            } catch (err: any) {
                console.warn('TMDB enrichment failed:', err.message);
            }
        }

        const now = new Date().toISOString();
        const item: MediaItem = {
            id: uuidv4(),
            type: enriched.type ?? 'movie',
            title: enriched.title ?? '',
            year: enriched.year ?? null,
            status: enriched.status ?? 'plantowatch',
            userRating: enriched.userRating ?? null,
            watchedAt: enriched.watchedAt ?? null,
            memo: enriched.memo ?? null,
            tmdbId: enriched.tmdbId ?? null,
            imdbId: enriched.imdbId ?? null,
            tvdbId: enriched.tvdbId ?? null,
            malId: enriched.malId ?? null,
            simklId: enriched.simklId ?? null,
            poster: enriched.poster ?? null,
            genres: enriched.genres ?? [],
            runtime: enriched.runtime ?? null,
            overview: enriched.overview ?? null,
            certification: enriched.certification ?? null,
            country: enriched.country ?? null,
            createdAt: now,
            updatedAt: now,
        };

        const created = repo.add(item);
        res.status(201).json(created);
    } catch (err: any) {
        console.error('Add error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/library/:id', (req, res) => {
    const updated = repo.update(req.params.id, req.body);
    if (!updated) { res.status(404).json({ error: 'Not found' }); return; }
    res.json(updated);
});

app.delete('/api/library/:id', (req, res) => {
    repo.remove(req.params.id);
    res.status(204).end();
});

// ---------- simkl import ----------

function extractSimklCommonFields(item: any, mediaObj: any, status: string) {
    const ids = mediaObj?.ids ?? {};
    const genres: string[] = mediaObj?.genres ?? [];
    const posterPath = mediaObj?.poster ? `https://simkl.in/posters/${mediaObj.poster}_m.webp` : '';

    return {
        title: s(mediaObj?.title),
        year: mediaObj?.year ?? null,
        userRating: item?.user_rating ?? null,
        status,
        memo: s(item?.memo ?? ''),
        imdbId: s(ids.imdb ?? ''),
        tmdbId: ids.tmdb ?? null,
        tvdbId: ids.tvdb ?? null,
        simklId: ids.simkl ?? null,
        poster: posterPath || null,
        genres,
        runtime: mediaObj?.runtime ?? null,
        certification: s(mediaObj?.certification ?? ''),
        country: s(mediaObj?.country ?? ''),
    };
}

app.post('/api/library/import/simkl', async (req, res) => {
    const { token } = req.body;
    if (!token) { res.status(400).json({ error: 'Missing token' }); return; }

    try {
        const items: MediaItem[] = [];
        const statusesToFetch = ['completed', 'watching', 'plantowatch', 'hold', 'dropped'];
        const now = new Date().toISOString();

        for (const status of statusesToFetch) {
            for (const mediaType of ['movies', 'shows', 'anime'] as const) {
                try {
                    console.log(`Importing ${mediaType}/${status}...`);
                    const data = await simklRequest(
                        `https://api.simkl.com/sync/all-items/${mediaType}/${status}?extended=full`,
                        token,
                    );

                    const key = mediaType === 'movies' ? 'movies' : mediaType;
                    const rawItems: any[] = data[key] ?? [];

                    for (const rawItem of rawItems) {
                        const mediaObj = rawItem.movie ?? rawItem.show ?? rawItem.anime ?? {};
                        const common = extractSimklCommonFields(rawItem, mediaObj, status);
                        const type: 'movie' | 'show' | 'anime' =
                            mediaType === 'movies' ? 'movie' : mediaType === 'anime' ? 'anime' : 'show';

                        items.push({
                            id: uuidv4(),
                            type,
                            title: common.title,
                            year: common.year,
                            status: status as any,
                            userRating: common.userRating,
                            watchedAt: s(rawItem.last_watched_at ?? ''),
                            memo: common.memo,
                            tmdbId: common.tmdbId,
                            imdbId: common.imdbId,
                            tvdbId: common.tvdbId,
                            malId: null,
                            simklId: common.simklId,
                            poster: common.poster,
                            genres: common.genres,
                            runtime: common.runtime,
                            overview: null,
                            certification: common.certification,
                            country: common.country,
                            createdAt: now,
                            updatedAt: now,
                        });
                    }
                } catch (err: any) {
                    console.warn(`Skipping ${mediaType}/${status}: ${err.message}`);
                }
            }
        }

        const count = repo.bulkUpsert(items);
        console.log(`Imported ${count} items from Simkl`);
        res.json({ imported: count });
    } catch (err: any) {
        console.error('Import error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- CSV export (from local DB now) ----------

app.get('/api/export/csv', (req, res) => {
    const format = (req.query.format as string) || 'raw';

    const transformer = getTransformer(format);
    if (!transformer) {
        res.status(400).json({ error: `Unknown format: ${format}` });
        return;
    }

    const items = repo.getAll();

    // Convert MediaItem[] to SimklRow[] for the transformer
    const rows: SimklRow[] = items.map((item) => ({
        Type: item.type,
        Title: item.title,
        Year: s(item.year ?? ''),
        Season: '',
        Episode: '',
        EpisodeTitle: '',
        WatchedAt: item.watchedAt ?? '',
        UserRating: s(item.userRating ?? ''),
        Status: item.status,
        Memo: item.memo ?? '',
        IMDB: item.imdbId ?? '',
        TMDB: s(item.tmdbId ?? ''),
        TVDB: s(item.tvdbId ?? ''),
        SimklID: s(item.simklId ?? ''),
        Slug: '',
        Poster: item.poster ?? '',
        Genres: (item.genres ?? []).join(', '),
        Runtime: s(item.runtime ?? ''),
        Certification: item.certification ?? '',
        Country: item.country ?? '',
    }));

    const result = transformer(rows);
    const csv = rowsToCSV(result.headers, result.rows);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(csv);
});

app.get('/api/formats', (_req, res) => {
    res.json(getAvailableFormats());
});

// ---------- start ----------

// SPA fallback: serve index.html for any unknown route
app.get('*', (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, 'index.html'));
});

app.listen(Number(PORT), () => {
    console.log(`Media Tracker server running on http://localhost:${PORT}`);
});
