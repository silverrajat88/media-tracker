import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import type { MediaItem } from './db/db.js';
import { SQLiteRepository } from './db/sqlite.js';
import { searchTMDB, getTMDBMovie, getTMDBShow, findTMDBMatch, getTMDBAiring, findById } from './providers/tmdb.js';
import { RealDebridClient } from './providers/realdebrid.js';
// import { scrapeYTS, scrapeEZTV } from './providers/scrapers.js'; // Deprecated
import { getTorrentioStreams } from './providers/torrentio.js';
import { searchAnime } from './providers/jikan.js';
import { getGeminiRecommendations } from './providers/gemini.js';
import type { SimklRow } from './types.js';
import { stremioLogin, getStremioLibrary } from './providers/stremio.js';
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

        // Cross-reference with local library
        const library = repo.getAll();
        const tmdbMap = new Map<number, any>();
        const malMap = new Map<number, any>();

        for (const item of library) {
            if (item.tmdbId) tmdbMap.set(item.tmdbId, item);
            if (item.malId) malMap.set(item.malId, item);
        }

        for (const result of results) {
            let match = null;
            if (result.tmdbId) match = tmdbMap.get(result.tmdbId);
            if (!match && result.malId) match = malMap.get(result.malId);

            if (match) {
                result.id = match.id;
                result.status = match.status;
                result.userRating = match.userRating;
            }
        }

        res.json(results);
    } catch (err: any) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/recommendations', async (req, res) => {
    try {
        const history = repo.getAll();

        // Simplistic genre extraction
        const genreCounts: Record<string, number> = {};
        history.forEach(item => {
            if (item.userRating && item.userRating >= 7) {
                item.genres?.forEach(g => { genreCounts[g] = (genreCounts[g] || 0) + 1; });
            }
        });

        const topGenres = Object.entries(genreCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([g]) => g);

        const aiRecs = await getGeminiRecommendations(history, topGenres);
        console.log(`✨ OpenAI returned ${aiRecs.length} items. Enriching...`);

        // Enrich with TMDB
        const enriched = await Promise.all(aiRecs.map(async (rec) => {
            try {
                const match = await findTMDBMatch(rec.title, rec.year, rec.type);
                if (match) {
                    return { ...match, reason: rec.reason, id: `virtual-${match.tmdbId}` };
                } else {
                    console.warn(`⚠️ No TMDB match for: ${rec.title}`);
                }
            } catch (e: any) {
                console.warn(`Failed to fetch enrichment for ${rec.title}: ${e.message}`);
            }
            return null;
        }));

        // Filter out nulls and existing items (dedup)
        const existingIds = new Set(history.map(i => i.tmdbId));
        const finalCheck = enriched.filter(i => i && i.tmdbId && !existingIds.has(i.tmdbId));

        console.log(`✅ Final recommendations: ${finalCheck.length}`);

        res.json(finalCheck);
    } catch (err: any) {
        console.error('Recommendation error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- calendar (airing schedule) ----------

app.get('/api/calendar', async (req, res) => {
    try {
        const month = (req.query.month as string) ?? new Date().toISOString().substring(0, 7); // YYYY-MM

        // 1. Check Cache
        const cached = repo.getCalendar(month);
        if (cached) {
            const age = Date.now() - new Date(cached.updatedAt).getTime();
            if (age < 24 * 60 * 60 * 1000) {
                // console.log(`Using cached calendar for ${month}`);
                res.json(cached.data);
                return;
            }
        }

        const [yearStr, monthStr] = month.split('-');
        const year = parseInt(yearStr, 10);
        const mon = parseInt(monthStr, 10);

        // Get all shows with status watching or plantowatch that have TMDB IDs
        const allItems = repo.getAll();
        const shows = allItems.filter(
            i => (i.type === 'show' || i.type === 'anime') && i.tmdbId && (i.status === 'watching' || i.status === 'plantowatch')
        );

        interface CalendarEntry {
            showTitle: string;
            showPoster: string | null;
            tmdbId: number;
            episodeName: string;
            airDate: string;
            season: number;
            episode: number;
        }

        const entries: CalendarEntry[] = [];

        console.log(`Fetching calendar for ${month} (${shows.length} shows)...`);

        // Fetch airing info for each show (with rate limiting)
        for (const show of shows) {
            try {
                await new Promise(r => setTimeout(r, 100)); // Rate limit
                const airing = await getTMDBAiring(show.tmdbId!);

                // Add next episode if it falls in the requested month
                if (airing.nextEpisode?.airDate) {
                    const [epYear, epMonth] = airing.nextEpisode.airDate.split('-').map(Number);
                    if (epYear === year && epMonth === mon) {
                        entries.push({
                            showTitle: airing.showTitle,
                            showPoster: airing.showPoster,
                            tmdbId: airing.tmdbId,
                            episodeName: airing.nextEpisode.name,
                            airDate: airing.nextEpisode.airDate,
                            season: airing.nextEpisode.season,
                            episode: airing.nextEpisode.episode,
                        });
                    }
                }

                // Also check last episode (might be current month)
                if (airing.lastEpisode?.airDate) {
                    const [epYear, epMonth] = airing.lastEpisode.airDate.split('-').map(Number);
                    if (epYear === year && epMonth === mon) {
                        // Avoid duplicates (same show, same air date)
                        const exists = entries.some(e => e.tmdbId === airing.tmdbId && e.airDate === airing.lastEpisode!.airDate);
                        if (!exists) {
                            entries.push({
                                showTitle: airing.showTitle,
                                showPoster: airing.showPoster,
                                tmdbId: airing.tmdbId,
                                episodeName: airing.lastEpisode.name,
                                airDate: airing.lastEpisode.airDate,
                                season: airing.lastEpisode.season,
                                episode: airing.lastEpisode.episode,
                            });
                        }
                    }
                }
            } catch (e: any) {
                console.warn(`Calendar: failed to fetch airing for ${show.title}: ${e.message}`);
            }
        }

        // Sort by air date
        entries.sort((a, b) => a.airDate.localeCompare(b.airDate));

        // 2. Set Cache
        repo.setCalendar(month, entries);

        res.json(entries);
    } catch (err: any) {
        console.error('Calendar error:', err);
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
            director: enriched.director ?? null,
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
/* ---------- detail page ---------- */

app.get('/api/library/:id/details', async (req, res) => {
    try {
        const { id } = req.params;
        let item: MediaItem | undefined;

        // Check if ID is a UUID (approximate check)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

        if (isUUID) {
            const dbItem = repo.getById(id);
            if (dbItem) item = dbItem;
            if (!item) return res.status(404).json({ error: 'Item not found' });

            // Lazy fetch metadata if 'overview' is missing (simulated enrichment)
            if (!item.overview && (item.tmdbId || item.imdbId)) {
                try {
                    let details: any = null;
                    if (item.tmdbId) {
                        details = item.type === 'movie' ? await getTMDBMovie(item.tmdbId) : await getTMDBShow(item.tmdbId);
                    } else if (item.imdbId) {
                        const match = await findById(item.imdbId, 'imdb_id');
                        if (match && match.tmdbId) {
                            item.tmdbId = match.tmdbId; // Update TMDB ID if found
                            details = item.type === 'movie' ? await getTMDBMovie(match.tmdbId) : await getTMDBShow(match.tmdbId);
                        }
                    }

                    if (details) {
                        // Update item fields
                        item.overview = details.overview || item.overview;
                        item.genres = (item.genres?.length ? item.genres : details.genres) || [];
                        item.runtime = item.runtime || details.runtime;
                        item.year = item.year || details.year;
                        item.certification = item.certification || details.certification;
                        item.country = item.country || details.country;

                        if (details.poster) {
                            const tmdbUrl = details.poster.startsWith('http') ? details.poster : `https://image.tmdb.org/t/p/w342${details.poster}`;
                            item.posterTmdb = tmdbUrl;
                            if (!item.poster) item.poster = tmdbUrl;
                        }

                        item.director = details.director || item.director;

                        // Save updates
                        repo.update(item.id, item);
                    }
                } catch (e) {
                    console.error(`Lazy fetch meta failed for ${item.title}:`, e);
                }
            }
        } else {
            // Handle virtual ID: type-externalId (e.g. movie-12345)
            const parts = id.split('-');
            const type = parts[0] as 'movie' | 'show' | 'anime';
            const externalId = parseInt(parts[1], 10);

            if (!['movie', 'show', 'anime'].includes(type) || isNaN(externalId)) {
                return res.status(400).json({ error: 'Invalid ID format' });
            }

            // 1. Check if we already have this item in the DB
            const allItems = repo.getAll();
            item = allItems.find(i =>
                i.type === type && (
                    (type === 'anime' && i.malId === externalId) ||
                    (type !== 'anime' && i.tmdbId === externalId)
                )
            );

            // 2. If not in DB, fetch from provider and create virtual item
            if (!item) {
                if (type === 'anime') {
                    // TODO: Add getAnimeDetails to jikan.ts if needed, or use search?
                    // For now, simpler to rely on search or just fail if not implemented
                    // Jikan searchAnime returns array, we need lookup by ID.
                    // Let's defer anime virtual details or implement getAnimeById if widely used.
                    // Assuming we only support TMDB for virtual details strictly for now or need to add Jikan lookup.
                    return res.status(501).json({ error: 'Virtual details for anime not yet implemented' });
                } else {
                    const details = type === 'movie' ? await getTMDBMovie(externalId) : await getTMDBShow(externalId);

                    // Construct virtual item
                    item = {
                        id: 'virtual', // Flag for frontend
                        type,
                        title: details.title,
                        year: details.year,
                        status: 'plantowatch', // Default for new items
                        userRating: null,
                        watchedAt: null,
                        memo: null,
                        tmdbId: externalId,
                        imdbId: details.imdbId,
                        tvdbId: details.tvdbId,
                        malId: null,
                        simklId: null,
                        poster: details.poster,
                        genres: details.genres,
                        runtime: details.runtime,
                        overview: details.overview,
                        certification: details.certification,
                        country: details.country,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        director: details.director,
                    };
                }
            }
        }

        // Enrich with fresh TMDB data if available
        let enriched = { ...item } as any;

        // If it's a virtual item, we already have details, but we might want extended props like cast/recs
        // If it's a DB item, we definitely want to enrich
        if (item.tmdbId && (item.type === 'movie' || item.type === 'show')) {
            try {
                // If we just fetched it for virtual, we technically re-fetch here which is wasteful but clean design.
                // optim: pass details if we already have them?
                const details = item.type === 'movie'
                    ? await getTMDBMovie(item.tmdbId)
                    : await getTMDBShow(item.tmdbId);

                enriched.backdrop = details.backdrop;
                enriched.cast = details.cast;
                enriched.recommendations = details.recommendations;
                enriched.voteAverage = (details as any).vote_average;
                enriched.voteCount = (details as any).vote_count;
                enriched.director = details.director;
            } catch (e: any) {
                console.warn(`Failed to fetch enrichment for ${item.title}: ${e.message}`);
            }
        }

        res.json(enriched);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// ---------- metadata refresh ----------

app.post('/api/library/metadata/refresh', async (req, res) => {
    const { hard = false } = req.body; // hard=true forces re-fetch of all poster data

    // 1. Get all items with TMDB IDs
    const items = repo.getAll().filter((i) => i.tmdbId);
    const rpdbKey = process.env.RPDB_API_KEY;

    // Determine which items actually need work
    const toProcess = hard
        ? items
        : items.filter(i => !i.posterTmdb || (rpdbKey && !i.posterRpdb));

    console.log(`Refresh: ${toProcess.length} items to process (hard=${hard}, total=${items.length})`);

    // Respond immediately
    res.json({ message: 'Refresh started', total: items.length, processing: toProcess.length });

    // 2. Process in background
    (async () => {
        let updatedCount = 0;
        for (const item of toProcess) {
            try {
                await new Promise((resolve) => setTimeout(resolve, 300));

                const updates: Record<string, any> = {};

                // Fetch TMDB poster if missing or hard refresh
                if (hard || !item.posterTmdb) {
                    if (item.type === 'movie' || item.type === 'show') {
                        const details = item.type === 'movie'
                            ? await getTMDBMovie(item.tmdbId!)
                            : await getTMDBShow(item.tmdbId!);

                        if (details.poster) {
                            const tmdbUrl = details.poster.startsWith('http')
                                ? details.poster
                                : `https://image.tmdb.org/t/p/w342${details.poster}`;
                            updates.posterTmdb = tmdbUrl;
                            // Also set as default poster if none exists
                            if (!item.poster) updates.poster = tmdbUrl;
                        }
                    }
                }

                // Compute RPDB poster URL if we have RPDB key and (missing or hard refresh)
                if (rpdbKey && (hard || !item.posterRpdb)) {
                    updates.posterRpdb = `https://api.ratingposterdb.com/${rpdbKey}/tmdb/poster-default/${item.tmdbId}.jpg`;
                }

                if (Object.keys(updates).length > 0) {
                    repo.update(item.id, updates as any);
                    updatedCount++;
                }
            } catch (err: any) {
                console.warn(`Failed to refresh ${item.title}: ${err.message}`);
            }
        }
        console.log(`Metadata refresh complete. Updated ${updatedCount}/${toProcess.length} items.`);
    })();
});

// ---------- clear all ----------

app.delete('/api/library/clear', (_req, res) => {
    repo.clearAll();
    res.json({ message: 'All library items cleared' });
});

// ---------- Real-Debrid Streaming ----------

const rdToken = process.env.REAL_DEBRID_TOKEN;
if (rdToken) console.log('✅ Real-Debrid Token loaded from .env');
else console.warn('⚠️ Real-Debrid Token not found in .env');

app.post('/api/settings/rd-token', async (req, res) => {
    // Just check status
    if (!rdToken) return res.status(401).json({ error: 'Token not configured in .env' });

    try {
        const rd = new RealDebridClient(rdToken);
        const user = await rd.getUser();
        res.json({ user });
    } catch (err: any) {
        res.status(401).json({ error: 'Invalid Token in .env' });
    }
});

app.get('/api/stream/search/:imdbId', async (req, res) => {
    if (!rdToken) return res.status(401).json({ error: 'Real-Debrid token not set' });
    const { imdbId } = req.params;
    const { season, episode } = req.query; // Optional

    try {
        const rd = new RealDebridClient(rdToken);
        const downloads = await rd.getDownloads(50);

        // 1. Check Cloud (Instant)
        const cloudFiles = downloads.filter(d => {
            // Heuristic: check if filename contains imdbId (rare) or title match?
            // RD doesn't store metadata well. We rely on filename matching.
            // This is weak. Better: We just search scrapers and see if RD has them cached (instant availability).
            return false; // Skip complex cloud matching for now, focus on "Add New".
        });

        // 2. Fetch Streams from Torrentio
        // We use Torrentio as it aggregates many trackers (YTS, EZTV, RARBG, 1337x...)
        let magnets: any[] = [];
        // Determine type based on season/episode presence
        const type = (season && episode) ? 'show' : 'movie';

        magnets = await getTorrentioStreams(type, imdbId, Number(season), Number(episode));

        // 3. Check Real-Debrid Cache (Instant Availability)
        // Optimization: We could check which infoHashes are instantly available on RD.
        // For now, we return all streams. The UI can show them.
        // When user clicks watches, we try to add. If cached, it's instant.

        res.json({ cloud: cloudFiles, magnets });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/stream/resolve', async (req, res) => {
    console.log('--- POST /api/stream/resolve ---');
    console.log('Body:', req.body);
    try {
        const { magnet } = req.body;
        if (!magnet) return res.status(400).json({ error: 'Magnet link required' });

        // 1. Get RD Client
        if (!rdToken) {
            console.error('RD Token is missing');
            return res.status(401).json({ error: 'Real-Debrid Token not configured' });
        }
        const rd = new RealDebridClient(rdToken);

        // 2. Add Magnet to RD
        console.log('Adding magnet to RD...');
        const addResult = await rd.addMagnet(magnet);
        console.log('Add Result:', addResult);

        // 3. Select Files (if needed)
        console.log('Checking torrent info for id:', addResult.id);
        let info = await rd.getTorrentInfo(addResult.id);
        console.log('Initial Info Status:', info.status);

        if (info.status === 'waiting_files_selection') {
            console.log('Selecting all files...');
            await rd.selectFiles(addResult.id, 'all');
            info = await rd.getTorrentInfo(addResult.id);
            console.log('Info after selection:', info.status);
        }

        // 4. Get Download Link (Unrestrict)
        if (!info.links || info.links.length === 0) {
            return res.status(400).json({ error: 'No links found in torrent' });
        }

        const linkToUnrestrict = info.links[0];
        console.log('Unrestricting link:', linkToUnrestrict);
        const unrestricted = await rd.unrestrictLink(linkToUnrestrict);
        console.log('Unrestricted:', unrestricted);

        return res.json({ link: unrestricted.download, mime: unrestricted.mimeType });
    } catch (err: any) {
        console.error('Error in /api/stream/resolve:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- simkl import ----------

// ... types ...
import { getPosterUrl } from './providers/images.js';

function extractSimklCommonFields(item: any, mediaObj: any, status: string) {
    const ids = mediaObj?.ids ?? {};
    const genres: string[] = mediaObj?.genres ?? [];
    const simklPoster = mediaObj?.poster ? `https://simkl.in/posters/${mediaObj.poster}_m.webp` : null;
    const tmdbId = ids.tmdb ?? null;

    // We don't have TMDB poster path here, so pass null for now. 
    // Default to TMDB (which falls back to Simkl if path is null) 
    // UNLESS we want imports to use RPDB by default? 
    // Let's stick to TMDB/Simkl default for imports to be predictable, user can refresh to RPDB.
    const posterUrl = getPosterUrl(tmdbId, null, simklPoster, 'tmdb');

    return {
        title: s(mediaObj?.title),
        year: mediaObj?.year ?? null,
        userRating: item?.user_rating ?? null,
        status,
        memo: s(item?.memo ?? ''),
        imdbId: s(ids.imdb ?? ''),
        tmdbId,
        tvdbId: ids.tvdb ?? null,
        simklId: ids.simkl ?? null,
        poster: posterUrl,
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

        const result = repo.bulkUpsert(items);
        console.log(`Simkl import: ${result.inserted} new, ${result.updated} updated`);
        res.json({ inserted: result.inserted, updated: result.updated, total: items.length });
    } catch (err: any) {
        console.error('Import error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ---------- stremio import ----------

app.post('/api/auth/stremio-login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400).json({ error: 'Email and password required' });
        return;
    }
    try {
        const authKey = await stremioLogin(email, password);
        res.json({ authKey });
    } catch (err: any) {
        console.error('Stremio login error:', err);
        res.status(401).json({ error: err.message });
    }
});

app.post('/api/library/import/stremio', async (req, res) => {
    const { authKey } = req.body;
    if (!authKey) { res.status(400).json({ error: 'Missing authKey' }); return; }

    try {
        console.log('Fetching Stremio library...');
        const stremioItems = await getStremioLibrary(authKey);
        console.log(`Got ${stremioItems.length} items from Stremio`);

        const items: MediaItem[] = [];
        const now = new Date().toISOString();

        for (const si of stremioItems) {
            try {
                // Rate limit TMDB lookups
                await new Promise(r => setTimeout(r, 250));

                // Try to find TMDB match via IMDB ID search
                const type = si.type === 'movie' ? 'movie' : 'show';
                const match = await findTMDBMatch(si.name, undefined, type);

                items.push({
                    id: uuidv4(),
                    type: type as 'movie' | 'show' | 'anime',
                    title: match?.title ?? si.name,
                    year: match?.year ?? null,
                    status: 'completed',
                    userRating: null,
                    watchedAt: si.lastWatched,
                    memo: null,
                    tmdbId: match?.tmdbId ?? null,
                    imdbId: si.imdbId,
                    tvdbId: match?.tvdbId ?? null,
                    malId: null,
                    simklId: null,
                    poster: match?.poster ?? si.poster,
                    genres: match?.genres ?? [],
                    runtime: match?.runtime ?? null,
                    overview: match?.overview ?? null,
                    certification: match?.certification ?? null,
                    country: match?.country ?? null,
                    createdAt: now,
                    updatedAt: now,
                });
            } catch (err: any) {
                console.warn(`Failed to enrich Stremio item ${si.name}: ${err.message}`);
                // Still add with basic info
                items.push({
                    id: uuidv4(),
                    type: si.type as 'movie' | 'show' | 'anime',
                    title: si.name,
                    year: null,
                    status: 'completed',
                    userRating: null,
                    watchedAt: si.lastWatched,
                    memo: null,
                    tmdbId: null,
                    imdbId: si.imdbId,
                    tvdbId: null,
                    malId: null,
                    simklId: null,
                    poster: si.poster,
                    genres: [],
                    runtime: null,
                    overview: null,
                    certification: null,
                    country: null,
                    createdAt: now,
                    updatedAt: now,
                });
            }
        }

        const result = repo.bulkUpsert(items);
        console.log(`Stremio import: ${result.inserted} new, ${result.updated} updated`);
        res.json({ inserted: result.inserted, updated: result.updated, total: items.length });
    } catch (err: any) {
        console.error('Stremio import error:', err);
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
