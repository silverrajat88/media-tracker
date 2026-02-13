import type { ProviderResult } from './types.js';
import { cache } from '../cache.js';

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const CACHE_TTL_SEARCH = 600;  // 10 min

/** Search anime via Jikan (MyAnimeList) */
export async function searchAnime(query: string): Promise<ProviderResult[]> {
    const cacheKey = `jikan:search:${query.toLowerCase()}`;
    const cached = cache.get<ProviderResult[]>(cacheKey);
    if (cached) return cached;

    const url = new URL(`${JIKAN_BASE}/anime`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '15');
    url.searchParams.set('sfw', 'true');

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Jikan API error ${res.status}: ${await res.text()}`);
    const json = await res.json();

    const results: ProviderResult[] = (json.data ?? []).map((item: any) => ({
        type: 'anime' as const,
        title: item.title_english ?? item.title ?? '',
        year: item.year ?? (item.aired?.from ? new Date(item.aired.from).getFullYear() : null),
        overview: item.synopsis ?? null,
        poster: item.images?.webp?.image_url ?? item.images?.jpg?.image_url ?? null,
        genres: [
            ...(item.genres ?? []).map((g: any) => g.name),
            ...(item.themes ?? []).map((t: any) => t.name),
        ],
        runtime: item.duration ? parseDuration(item.duration) : null,
        certification: item.rating ?? null,
        country: 'JP',
        tmdbId: null,
        imdbId: null,
        tvdbId: null,
        malId: item.mal_id ?? null,
    }));

    cache.set(cacheKey, results, CACHE_TTL_SEARCH);
    return results;
}

/** Parse Jikan duration string like "24 min per ep" into minutes */
function parseDuration(dur: string): number | null {
    const match = dur.match(/(\d+)\s*min/);
    return match ? parseInt(match[1], 10) : null;
}
