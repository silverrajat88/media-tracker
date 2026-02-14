import { cache } from '../cache.js';

interface TorrentioStream {
    name: string;
    title: string;
    infoHash: string;
    fileIdx?: number;
    behaviorHints?: {
        bingeGroup?: string;
    };
}

export interface StreamResult {
    source: string;
    title: string;
    quality: string;
    size: string;
    seeds: number;
    magnet: string;
    infoHash: string;
}

const BASE_URL = 'https://torrentio.strem.fun';
// We can use a configured URL if we want to filter resolution etc, but raw is fine.
// https://torrentio.strem.fun/stream/movie/{imdbId}.json
// https://torrentio.strem.fun/stream/series/{imdbId}:{season}:{episode}.json

export async function getTorrentioStreams(type: 'movie' | 'show', imdbId: string, season?: number, episode?: number): Promise<StreamResult[]> {
    const cacheKey = `torrentio:${type}:${imdbId}:${season || ''}:${episode || ''}`;
    const cached = cache.get<StreamResult[]>(cacheKey);
    if (cached) return cached;

    let url = '';
    if (type === 'movie') {
        url = `${BASE_URL}/stream/movie/${imdbId}.json`;
    } else {
        url = `${BASE_URL}/stream/series/${imdbId}:${season}:${episode}.json`;
    }

    try {
        console.log(`Fetching streams from: ${url}`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Torrentio fetch failed: ${res.status}`);

        const data = await res.json();
        const streams: TorrentioStream[] = data.streams || [];

        const results: StreamResult[] = streams.map(s => {
            // Parse title for quality/seeds/size
            // Format: "Title\nUser\nQuality\nSize\nSeeds"
            // Example: "Inception 2010\nTorrentGalaxy\n4k\n12.5GB\n👤 123"
            const parts = s.title.split('\n');
            const quality = parts.find(p => p.match(/\d{3,4}p|4k|HDR/i)) || 'Unknown';
            const size = parts.find(p => p.match(/\d+(\.\d+)?[GM]B/)) || '';
            const seedsStr = parts.find(p => p.includes('👤'));
            const seeds = seedsStr ? parseInt(seedsStr.replace('👤', '').trim()) : 0;

            // Construct magnet if not present (Torrentio usually gives infoData or url)
            // Actually Torrentio returns 'url' which IS the magnet link usually, or infoHash.
            // If it's a magnet, it's in 'url'. If it's real-debrid enabled in config, it might be an HTTP link.
            // Since we use public Torrentio, it returns magnet links in 'url' field usually? 
            // Let's check the test script output.
            // Wait, standard Stremio addons return 'url' (magnet) or 'infoHash'.
            // If 'infoHash' is present, we construct magnet.

            let magnet = (s as any).url;
            if (!magnet && s.infoHash) {
                magnet = `magnet:?xt=urn:btih:${s.infoHash}&dn=${encodeURIComponent(s.name)}&tr=udp://tracker.opentrackr.org:1337/announce`;
            }

            return {
                source: s.name || 'Torrentio',
                title: parts[0] || s.name,
                quality,
                size,
                seeds,
                magnet,
                infoHash: s.infoHash
            };
        });

        // Sort by seeds desc
        results.sort((a, b) => b.seeds - a.seeds);

        cache.set(cacheKey, results, 3600); // 1 hour cache
        return results;
    } catch (e) {
        console.error('Torrentio Error:', e);
        return [];
    }
}
