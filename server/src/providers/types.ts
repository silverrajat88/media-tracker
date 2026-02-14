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
    backdrop: string | null;
    // Cross-platform IDs
    tmdbId: number | null;
    imdbId: string | null;
    tvdbId: number | null;
    malId: number | null;
    cast?: { id: number; name: string; character: string; profile: string | null }[];
    recommendations?: { tmdbId: number; title: string; poster: string | null; year: number | null }[];
    director?: string | null;
}

export interface MetadataProvider {
    /** Search for titles by query */
    search(query: string, type?: 'movie' | 'show' | 'anime'): Promise<ProviderResult[]>;
}
