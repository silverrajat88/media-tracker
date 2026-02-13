import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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
    PORT = '3001',
} = process.env;

// ---------- helpers ----------

async function simklRequest(url: string, token: string) {
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            'simkl-api-key': SIMKL_CLIENT_ID!,
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Simkl API error ${res.status}: ${text}`);
    }
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

// ---------- data extraction ----------

function extractCommonFields(item: any, mediaObj: any, status: string): Partial<SimklRow> {
    const ids = mediaObj?.ids ?? {};
    const genres: string[] = mediaObj?.genres ?? [];
    const posterPath = mediaObj?.poster ? `https://simkl.in/posters/${mediaObj.poster}_m.webp` : '';

    return {
        Title: s(mediaObj?.title),
        Year: s(mediaObj?.year),
        UserRating: s(item?.user_rating ?? ''),
        Status: status,
        Memo: s(item?.memo ?? ''),
        IMDB: s(ids.imdb ?? ''),
        TMDB: s(ids.tmdb ?? ''),
        TVDB: s(ids.tvdb ?? ''),
        SimklID: s(ids.simkl ?? ''),
        Slug: s(ids.slug ?? ''),
        Poster: posterPath,
        Genres: genres.join(', '),
        Runtime: s(mediaObj?.runtime ?? ''),
        Certification: s(mediaObj?.certification ?? ''),
        Country: s(mediaObj?.country ?? ''),
    };
}

function processMovies(data: any, status: string): SimklRow[] {
    const rows: SimklRow[] = [];
    for (const item of data.movies ?? []) {
        const movie = item.movie ?? {};
        const common = extractCommonFields(item, movie, status);
        rows.push({
            Type: 'movie',
            Season: '',
            Episode: '',
            EpisodeTitle: '',
            WatchedAt: s(item.last_watched_at ?? ''),
            ...common,
        } as SimklRow);
    }
    return rows;
}

function processShows(data: any, typeLabel: 'show' | 'anime', status: string): SimklRow[] {
    const rows: SimklRow[] = [];
    const key = typeLabel === 'show' ? 'shows' : 'anime';
    const items: any[] = data[key] ?? [];

    for (const item of items) {
        const show = item.show ?? item.anime ?? {};
        const common = extractCommonFields(item, show, status);
        const episodes: any[] = item.episodes ?? [];

        if (episodes.length === 0) {
            rows.push({
                Type: typeLabel,
                Season: '',
                Episode: '',
                EpisodeTitle: '',
                WatchedAt: s(item.last_watched_at ?? ''),
                ...common,
            } as SimklRow);
            continue;
        }

        for (const ep of episodes) {
            rows.push({
                Type: 'episode',
                Season: s(ep.season ?? ''),
                Episode: s(ep.episode ?? ep.number ?? ''),
                EpisodeTitle: s(ep.title ?? ''),
                WatchedAt: s(ep.watched_at ?? item.last_watched_at ?? ''),
                ...common,
            } as SimklRow);
        }
    }
    return rows;
}

function rowsToCSV(headers: string[], rows: Record<string, string>[]): string {
    const lines = [headers.join(',')];
    for (const row of rows) {
        lines.push(headers.map((h) => escapeCSV(row[h] ?? '')).join(','));
    }
    return lines.join('\n');
}

/** Shared: fetch all Simkl data for a given token */
async function fetchAllSimklData(token: string): Promise<SimklRow[]> {
    const allRows: SimklRow[] = [];
    const statusesToFetch = ['completed', 'watching', 'plantowatch', 'hold', 'dropped'];

    for (const status of statusesToFetch) {
        for (const mediaType of ['movies', 'shows', 'anime'] as const) {
            try {
                console.log(`Fetching ${mediaType}/${status}...`);
                const data = await simklRequest(
                    `https://api.simkl.com/sync/all-items/${mediaType}/${status}?extended=full&episode_watched_at=yes`,
                    token,
                );

                if (mediaType === 'movies') {
                    allRows.push(...processMovies(data, status));
                } else {
                    const label = mediaType === 'shows' ? 'show' : 'anime';
                    allRows.push(...processShows(data, label, status));
                }
            } catch (err: any) {
                console.warn(`Skipping ${mediaType}/${status}: ${err.message}`);
            }
        }
    }

    console.log(`Total rows fetched: ${allRows.length}`);
    return allRows;
}

// ---------- routes ----------

/** Exchange OAuth code for access token */
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

/** Fetch Simkl history and return as JSON */
app.get('/api/data', async (req, res) => {
    const token = req.query.token as string;
    if (!token) { res.status(400).json({ error: 'Missing token' }); return; }

    try {
        const allRows = await fetchAllSimklData(token);
        res.json(allRows);
    } catch (err: any) {
        console.error('Data fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

/** Fetch Simkl history and return CSV in requested format */
app.get('/api/export/csv', async (req, res) => {
    const token = req.query.token as string;
    const format = (req.query.format as string) || 'raw';

    if (!token) { res.status(400).json({ error: 'Missing token' }); return; }

    const transformer = getTransformer(format);
    if (!transformer) {
        res.status(400).json({ error: `Unknown format: ${format}. Available: ${getAvailableFormats().map(f => f.id).join(', ')}` });
        return;
    }

    try {
        const allRows = await fetchAllSimklData(token);
        console.log(`Transforming ${allRows.length} rows to "${format}"...`);
        const result = transformer(allRows);
        const csv = rowsToCSV(result.headers, result.rows);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        res.send(csv);
    } catch (err: any) {
        console.error('Export error:', err);
        res.status(500).json({ error: err.message });
    }
});

/** Return Simkl OAuth URL */
app.get('/api/auth/simkl-url', (_req, res) => {
    const url = `https://simkl.com/oauth/authorize?response_type=code&client_id=${SIMKL_CLIENT_ID}&redirect_uri=${encodeURIComponent(SIMKL_REDIRECT_URI!)}`;
    res.json({ url });
});

/** Return available export formats */
app.get('/api/formats', (_req, res) => {
    res.json(getAvailableFormats());
});

app.listen(Number(PORT), () => {
    console.log(`Simkl Exporter server running on http://localhost:${PORT}`);
});
