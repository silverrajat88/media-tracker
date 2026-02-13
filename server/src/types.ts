/**
 * Shared types for the Simkl Exporter.
 * SimklRow is the rich, canonical row format holding every field we extract from Simkl.
 */

export interface SimklRow {
    Type: string;           // movie | show | anime | episode
    Title: string;
    Year: string;
    Season: string;
    Episode: string;
    EpisodeTitle: string;
    WatchedAt: string;
    UserRating: string;
    Status: string;         // completed | watching | plantowatch | hold | dropped
    Memo: string;
    IMDB: string;
    TMDB: string;
    TVDB: string;
    SimklID: string;
    Slug: string;
    Poster: string;
    Genres: string;         // comma-separated
    Runtime: string;        // minutes
    Certification: string;
    Country: string;
}

export const SIMKL_ROW_HEADERS: (keyof SimklRow)[] = [
    'Type', 'Title', 'Year', 'Season', 'Episode', 'EpisodeTitle',
    'WatchedAt', 'UserRating', 'Status', 'Memo',
    'IMDB', 'TMDB', 'TVDB', 'SimklID', 'Slug',
    'Poster', 'Genres', 'Runtime', 'Certification', 'Country',
];
