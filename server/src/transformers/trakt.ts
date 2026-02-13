/**
 * Trakt transformer.
 * Converts rich SimklRow[] → Trakt-compatible CSV format.
 * Trakt CSV import expects: Title, Year, Season, Episode, WatchedAt, imdb, tmdb
 */

import type { SimklRow } from '../types.js';
import type { TransformedResult } from './index.js';

const TRAKT_HEADERS = [
    'Type', 'Title', 'Year', 'Season', 'Episode',
    'WatchedAt', 'Rating10', 'imdb', 'tmdb',
];

export function traktTransformer(rows: SimklRow[]): TransformedResult {
    return {
        headers: TRAKT_HEADERS,
        rows: rows.map((r) => ({
            Type: r.Type === 'anime' ? 'show' : r.Type,   // Trakt treats anime as shows
            Title: r.Title,
            Year: r.Year,
            Season: r.Season,
            Episode: r.Episode,
            WatchedAt: r.WatchedAt,
            Rating10: r.UserRating,
            imdb: r.IMDB,
            tmdb: r.TMDB,
        })),
        filename: 'simkl_export_trakt.csv',
    };
}
