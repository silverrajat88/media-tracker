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
        backdrop: r.backdrop_path ? `https://image.tmdb.org/t/p/original${r.backdrop_path}` : null,
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

export async function findTMDBMatch(title: string, year?: number, type?: 'movie' | 'show' | 'anime'): Promise<ProviderResult | null> {
    // Basic search
    const results = await searchTMDB(title, type === 'anime' ? undefined : type);

    // Fuzzy match
    const match = results.find(r => {
        // Exact title match
        if (r.title.toLowerCase() === title.toLowerCase()) return true;
        // Year match if provided
        if (year && r.year === year) return true;
        return false;
    });

    return match || results[0] || null;
}

/** Find TMDB ID by external ID (IMDB, TVDB) */
export async function findById(externalId: string, source: 'imdb_id' | 'tvdb_id'): Promise<ProviderResult | null> {
    const cacheKey = `tmdb:find:${source}:${externalId}`;
    const cached = cache.get<ProviderResult>(cacheKey);
    if (cached) return cached;

    const data = await tmdbFetch(`/find/${externalId}`, { external_source: source });
    const result = data.movie_results?.[0] || data.tv_results?.[0];

    if (!result) return null;

    const mapped: ProviderResult = {
        type: data.movie_results?.length ? 'movie' : 'show',
        title: result.title ?? result.name ?? '',
        year: parseYear(result.release_date ?? result.first_air_date),
        overview: result.overview ?? null,
        poster: result.poster_path ? `${TMDB_IMG}${result.poster_path}` : null,
        backdrop: result.backdrop_path ? `https://image.tmdb.org/t/p/original${result.backdrop_path}` : null,
        genres: [],
        runtime: null,
        certification: null,
        country: null,
        tmdbId: result.id,
        imdbId: source === 'imdb_id' ? externalId : null,
        tvdbId: source === 'tvdb_id' ? parseInt(externalId, 10) : null,
        malId: null,
    };

    cache.set(cacheKey, mapped, CACHE_TTL_SEARCH);
    return mapped;
}

/** Get full movie details from TMDB (includes external IDs, genres, runtime) */
export async function getTMDBMovie(tmdbId: number): Promise<ProviderResult> {
    const cacheKey = `tmdb:movie:${tmdbId}`;
    const cached = cache.get<ProviderResult>(cacheKey);
    if (cached) return cached;

    const [details, externalIds] = await Promise.all([
        tmdbFetch(`/movie/${tmdbId}?append_to_response=credits,recommendations`),
        tmdbFetch(`/movie/${tmdbId}/external_ids`),
    ]);

    const result: ProviderResult = {
        type: 'movie',
        title: details.title ?? '',
        year: parseYear(details.release_date),
        overview: details.overview ?? null,
        poster: details.poster_path ? `${TMDB_IMG}${details.poster_path}` : null,
        backdrop: details.backdrop_path ? `https://image.tmdb.org/t/p/original${details.backdrop_path}` : null,
        genres: (details.genres ?? []).map((g: any) => g.name),
        runtime: details.runtime ?? null,
        certification: null,
        country: (details.production_countries ?? [])[0]?.iso_3166_1 ?? null,
        tmdbId: tmdbId,
        imdbId: externalIds.imdb_id ?? null,
        tvdbId: null,
        malId: null,
        cast: details.credits?.cast?.slice(0, 10).map((c: any) => ({
            id: c.id,
            name: c.name,
            character: c.character,
            profile: c.profile_path ? `${TMDB_IMG}${c.profile_path}` : null
        })) || [],
        recommendations: details.recommendations?.results?.slice(0, 5).map((r: any) => ({
            tmdbId: r.id,
            title: r.title,
            poster: r.poster_path ? `${TMDB_IMG}${r.poster_path}` : null,
            year: parseYear(r.release_date)
        })) || [],
        director: details.credits?.crew?.find((c: any) => c.job === 'Director')?.name || null
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
        tmdbFetch(`/tv/${tmdbId}?append_to_response=credits,recommendations`),
        tmdbFetch(`/tv/${tmdbId}/external_ids`),
    ]);

    const result: ProviderResult = {
        type: 'show',
        title: details.name ?? '',
        year: parseYear(details.first_air_date),
        overview: details.overview ?? null,
        poster: details.poster_path ? `${TMDB_IMG}${details.poster_path}` : null,
        backdrop: details.backdrop_path ? `https://image.tmdb.org/t/p/original${details.backdrop_path}` : null,
        genres: (details.genres ?? []).map((g: any) => g.name),
        runtime: details.episode_run_time?.[0] ?? null,
        certification: null,
        country: (details.origin_country ?? [])[0] ?? null,
        tmdbId: tmdbId,
        imdbId: externalIds.imdb_id ?? null,
        tvdbId: externalIds.tvdb_id ?? null,
        malId: null,
        cast: details.credits?.cast?.slice(0, 10).map((c: any) => ({
            id: c.id,
            name: c.name,
            character: c.character,
            profile: c.profile_path ? `${TMDB_IMG}${c.profile_path}` : null
        })) || [],
        recommendations: details.recommendations?.results?.slice(0, 5).map((r: any) => ({
            tmdbId: r.id,
            title: r.name,
            poster: r.poster_path ? `${TMDB_IMG}${r.poster_path}` : null,
            year: parseYear(r.first_air_date)
        })) || [],
        director: (details.created_by?.map((c: any) => c.name).join(', ')) ||
            (details.credits?.crew?.find((c: any) => c.job === 'Executive Producer')?.name) || null
    };

    cache.set(cacheKey, result, CACHE_TTL_DETAIL);
    return result;
}

/** Get airing info for a TV show (next/last episode, status) */
export async function getTMDBAiring(tmdbId: number): Promise<{
    showTitle: string;
    showPoster: string | null;
    tmdbId: number;
    status: string;
    nextEpisode: { name: string; airDate: string; season: number; episode: number } | null;
    lastEpisode: { name: string; airDate: string; season: number; episode: number } | null;
}> {
    const cacheKey = `tmdb:airing:${tmdbId}`;
    const cached = cache.get<any>(cacheKey);
    if (cached) return cached;

    const details = await tmdbFetch(`/tv/${tmdbId}`);

    const mapEp = (ep: any) => ep ? {
        name: ep.name ?? '',
        airDate: ep.air_date ?? '',
        season: ep.season_number ?? 0,
        episode: ep.episode_number ?? 0,
    } : null;

    const result = {
        showTitle: details.name ?? '',
        showPoster: details.poster_path ? `${TMDB_IMG}${details.poster_path}` : null,
        tmdbId,
        status: details.status ?? '',
        nextEpisode: mapEp(details.next_episode_to_air),
        lastEpisode: mapEp(details.last_episode_to_air),
    };

    cache.set(cacheKey, result, 3600); // 1 hour cache
    return result;
}

function parseYear(dateStr: string | undefined | null): number | null {
    if (!dateStr) return null;
    const y = parseInt(dateStr.substring(0, 4), 10);
    return isNaN(y) ? null : y;
}
