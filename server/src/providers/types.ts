/**
 * ProviderResult — normalized metadata from any external provider.
 * Both TMDB and Jikan return this shape.
 */
export interface ProviderResult {
    type: 'movie' | 'show' | 'anime';
    title: string;
    year: number | null;
    overview: string | null;
    poster: string | null;
    genres: string[];
    runtime: number | null;
    certification: string | null;
    country: string | null;
    // Cross-platform IDs
    tmdbId: number | null;
    imdbId: string | null;
    tvdbId: number | null;
    malId: number | null;
}

export interface MetadataProvider {
    /** Search for titles by query */
    search(query: string, type?: 'movie' | 'show' | 'anime'): Promise<ProviderResult[]>;
}
