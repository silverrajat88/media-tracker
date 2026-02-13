
const TMDB_IMG = 'https://image.tmdb.org/t/p/w342';

/**
 * Resolves the best available poster URL based on configuration and available data.
 * Priority:
 * 1. RPDB (if configured and TMDB ID available) - Deterministic, high quality, ratings
 * 2. TMDB (if poster path available)
 * 3. Simkl (fallback)
 */
export function getPosterUrl(
    tmdbId: number | null,
    tmdbPosterPath: string | null,
    simklPoster: string | null,
    provider: 'tmdb' | 'rpdb' = 'tmdb'
): string | null {
    const rpdbKey = process.env.RPDB_API_KEY;

    // 1. RPDB (Only if requested AND key exists AND tmdbId exists)
    if (provider === 'rpdb' && rpdbKey && tmdbId) {
        return `https://api.ratingposterdb.com/${rpdbKey}/tmdb/poster-default/${tmdbId}.jpg`;
    }

    // 2. TMDB (Default or Fallback)
    // Note: tmdbPosterPath takes precedence over Simkl if available (re-imports or refreshes)
    if (tmdbPosterPath) {
        // Handle case where path is just the hash or full URL
        if (tmdbPosterPath.startsWith('http')) return tmdbPosterPath;
        return `${TMDB_IMG}${tmdbPosterPath}`;
    }

    // 3. Simkl (Fallback)
    if (simklPoster) {
        return simklPoster;
    }

    return null;
}
