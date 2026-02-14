export interface MediaItem {
    id: string;
    type: 'movie' | 'show' | 'anime';
    title: string;
    year: number | null;
    status: string;
    userRating: number | null;
    watchedAt: string | null;
    memo: string | null;
    tmdbId: number | null;
    imdbId: string | null;
    tvdbId: number | null;
    malId: number | null;
    simklId: number | null;
    poster: string | null;
    posterTmdb?: string | null;
    posterRpdb?: string | null;
    genres: string[];
    runtime: number | null;
    overview: string | null;
    certification: string | null;
    country: string | null;
    createdAt: string;
    updatedAt: string;
    director?: string | null;
}

export interface SearchResult {
    type: 'movie' | 'show' | 'anime';
    title: string;
    year: number | null;
    overview: string | null;
    poster: string | null;
    genres: string[];
    runtime: number | null;
    tmdbId: number | null;
    imdbId: string | null;
    tvdbId: number | null;
    malId: number | null;
    // library fields if exists
    id?: string;
    status?: StatusType;
    userRating?: number | null;
}

export type StatusType = 'completed' | 'watching' | 'plantowatch' | 'hold' | 'dropped';

export const STATUS_OPTIONS: { value: StatusType; label: string }[] = [
    { value: 'completed', label: 'Completed' },
    { value: 'watching', label: 'Watching' },
    { value: 'plantowatch', label: 'Plan to Watch' },
    { value: 'hold', label: 'On Hold' },
    { value: 'dropped', label: 'Dropped' },
];
