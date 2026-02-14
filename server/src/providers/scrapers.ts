import { cache } from '../cache.js';

interface MagnetResult {
    source: string;
    title: string;
    magnet: string;
    seeds: number;
    size: string;
    quality: string;
}

const CACHE_TTL_SCRAPE = 3600; // 1 hour

export async function scrapeYTS(imdbId: string): Promise<MagnetResult[]> {
    const cacheKey = `scrape:yts:${imdbId}`;
    const cached = cache.get<MagnetResult[]>(cacheKey);
    if (cached) return cached;

    try {
        const res = await fetch(`https://yts.mx/api/v2/movie_details.json?imdb_id=${imdbId}`);
        const data = await res.json();

        if (!data.data?.movie?.torrents) return [];

        const movie = data.data.movie;
        const results: MagnetResult[] = movie.torrents.map((t: any) => {
            // Construct magnet link manually for YTS
            const tracker = 'tracker.opentrackr.org:1337/announce';
            const magnet = `magnet:?xt=urn:btih:${t.hash}&dn=${encodeURIComponent(movie.title)}&tr=udp://${tracker}`;

            return {
                source: 'YTS',
                title: `${movie.title} [${t.quality}] [${t.type}]`,
                magnet,
                seeds: t.seeds,
                size: t.size,
                quality: t.quality
            };
        });

        cache.set(cacheKey, results, CACHE_TTL_SCRAPE);
        return results;
    } catch (e) {
        console.error('YTS Scrape Error:', e);
        return [];
    }
}

// Simple EZTV Scraper (Backup/Show source)
// Using eztv.re api
export async function scrapeEZTV(imdbId: string, season?: number, episode?: number): Promise<MagnetResult[]> {
    const cacheKey = `scrape:eztv:${imdbId}:${season}:${episode}`;
    const cached = cache.get<MagnetResult[]>(cacheKey);
    if (cached) return cached;

    try {
        // remove 'tt' from imdbId for EZTV
        const id = imdbId.replace('tt', '');
        const res = await fetch(`https://eztv.re/api/get-torrents?imdb_id=${id}`);
        const data = await res.json();

        if (!data.torrents) return [];

        let torrents = data.torrents;

        // Filter by S/E if provided
        if (season && episode) {
            const sStr = `S${String(season).padStart(2, '0')}`;
            const eStr = `E${String(episode).padStart(2, '0')}`;
            torrents = torrents.filter((t: any) =>
                t.title.toUpperCase().includes(sStr) && t.title.toUpperCase().includes(eStr)
            );
        }

        const results: MagnetResult[] = torrents.map((t: any) => ({
            source: 'EZTV',
            title: t.title,
            magnet: t.magnet_url,
            seeds: t.seeds,
            size: formatBytes(t.size_bytes),
            quality: 'HD' // EZTV doesn't always specify clearly in API, title has it
        })).slice(0, 10); // Limit to top 10

        cache.set(cacheKey, results, CACHE_TTL_SCRAPE);
        return results;
    } catch (e) {
        console.error('EZTV Scrape Error:', e);
        return [];
    }
}

function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
