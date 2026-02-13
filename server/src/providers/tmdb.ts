import type { ProviderResult } from './types.js';
import { cache } from '../cache.js';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';
const CACHE_TTL_SEARCH = 600;   // 10 min
const CACHE_TTL_DETAIL = 3600;  // 1 hour

function getApiKey(): string {
    const key = process.env.TMDB_API_KEY;
    if (!key) throw new Error('TMDB_API_KEY not set in environment');
    return key;
}

async function tmdbFetch(path: string, params: Record<string, string> = {}): Promise<any> {
    const url = new URL(`${TMDB_BASE}${path}`);
    url.searchParams.set('api_key', getApiKey());
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`TMDB API error ${res.status}: ${await res.text()}`);
    return res.json();
}

/** Search movies and/or TV shows on TMDB */
export async function searchTMDB(query: string, type?: 'movie' | 'show'): Promise<ProviderResult[]> {
    const cacheKey = `tmdb:search:${type ?? 'multi'}:${query.toLowerCase()}`;
    const cached = cache.get<ProviderResult[]>(cacheKey);
    if (cached) return cached;

    let results: any[] = [];

    if (!type || type === 'movie') {
        const movieData = await tmdbFetch('/search/movie', { query, include_adult: 'false' });
        results.push(...(movieData.results ?? []).map((r: any) => ({ ...r, _type: 'movie' as const })));
    }

    if (!type || type === 'show') {
        const tvData = await tmdbFetch('/search/tv', { query, include_adult: 'false' });
        results.push(...(tvData.results ?? []).map((r: any) => ({ ...r, _type: 'show' as const })));
    }

    // Sort by popularity descending
    results.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

    const mapped: ProviderResult[] = results.slice(0, 20).map((r) => ({
        type: r._type,
        title: r.title ?? r.name ?? '',
        year: parseYear(r.release_date ?? r.first_air_date),
        overview: r.overview ?? null,
        poster: r.poster_path ? `${TMDB_IMG}${r.poster_path}` : null,
        genres: [], // Basic search doesn't include genres
        runtime: null,
        certification: null,
        country: null,
        tmdbId: r.id,
        imdbId: null,
        tvdbId: null,
        malId: null,
    }));

    cache.set(cacheKey, mapped, CACHE_TTL_SEARCH);
    return mapped;
}

/** Get full movie details from TMDB (includes external IDs, genres, runtime) */
export async function getTMDBMovie(tmdbId: number): Promise<ProviderResult> {
    const cacheKey = `tmdb:movie:${tmdbId}`;
    const cached = cache.get<ProviderResult>(cacheKey);
    if (cached) return cached;

    const [details, externalIds] = await Promise.all([
        tmdbFetch(`/movie/${tmdbId}`),
        tmdbFetch(`/movie/${tmdbId}/external_ids`),
    ]);

    const result: ProviderResult = {
        type: 'movie',
        title: details.title ?? '',
        year: parseYear(details.release_date),
        overview: details.overview ?? null,
        poster: details.poster_path ? `${TMDB_IMG}${details.poster_path}` : null,
        genres: (details.genres ?? []).map((g: any) => g.name),
        runtime: details.runtime ?? null,
        certification: null,
        country: (details.production_countries ?? [])[0]?.iso_3166_1 ?? null,
        tmdbId: tmdbId,
        imdbId: externalIds.imdb_id ?? null,
        tvdbId: null,
        malId: null,
    };

    cache.set(cacheKey, result, CACHE_TTL_DETAIL);
    return result;
}

/** Get full TV show details from TMDB (includes external IDs, genres) */
export async function getTMDBShow(tmdbId: number): Promise<ProviderResult> {
    const cacheKey = `tmdb:tv:${tmdbId}`;
    const cached = cache.get<ProviderResult>(cacheKey);
    if (cached) return cached;

    const [details, externalIds] = await Promise.all([
        tmdbFetch(`/tv/${tmdbId}`),
        tmdbFetch(`/tv/${tmdbId}/external_ids`),
    ]);

    const result: ProviderResult = {
        type: 'show',
        title: details.name ?? '',
        year: parseYear(details.first_air_date),
        overview: details.overview ?? null,
        poster: details.poster_path ? `${TMDB_IMG}${details.poster_path}` : null,
        genres: (details.genres ?? []).map((g: any) => g.name),
        runtime: details.episode_run_time?.[0] ?? null,
        certification: null,
        country: (details.origin_country ?? [])[0] ?? null,
        tmdbId: tmdbId,
        imdbId: externalIds.imdb_id ?? null,
        tvdbId: externalIds.tvdb_id ?? null,
        malId: null,
    };

    cache.set(cacheKey, result, CACHE_TTL_DETAIL);
    return result;
}

function parseYear(dateStr: string | undefined | null): number | null {
    if (!dateStr) return null;
    const y = parseInt(dateStr.substring(0, 4), 10);
    return isNaN(y) ? null : y;
}
