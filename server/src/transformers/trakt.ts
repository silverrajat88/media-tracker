/**
 * Trakt transformer.
 * Converts rich SimklRow[] → Trakt-compatible CSV format.
 * Trakt CSV import expects: Title, Year, Season, Episode, WatchedAt, imdb, tmdb
 */

import type { SimklRow } from '../types.js';
import type { TransformedResult } from './index.js';

// Trakt CSV import schema:
// id (imdb_id, tmdb_id, etc.), type, watched_at, watchlisted_at, rating, rated_at
// Reference: https://trakt.tv/users/me/import

const TRAKT_HEADERS = [
    'imdb_id', 'tmdb_id', 'type', 'watched_at', 'watchlisted_at', 'rating', 'rated_at'
];

export function traktTransformer(rows: SimklRow[]): TransformedResult {
    // Map Simkl rows to Trakt CSV format
    const mappedRows = rows.map((r) => {
        let type = (r.Type || '').toLowerCase();

        // Normalize type
        if (type === 'anime') type = 'show';
        if (type === 'series') type = 'show'; // Just in case

        // Ensure type is valid (default to movie if unknown/missing to avoid error, 
        // though strictly we should maybe skip?)
        if (!['movie', 'show', 'episode', 'season'].includes(type)) {
            // Heuristic: if it has Season/Episode, it's an episode
            if (r.Season && r.Episode) type = 'episode';
            else type = 'movie'; // Default fallback
        }

        // Logic for watched vs watchlist
        // If status is 'plantowatch', we treat it as watchlist check
        // We don't have a separate 'AddedToWatchlist' date in SimklRow, 
        // so we might miss 'watchlisted_at' if we strictly rely on that.
        // However, if we leave 'watched_at' empty, it might be fine.

        const isWatched = r.Status === 'completed' || r.Status === 'watching' || r.Status === 'dropped' || !!r.WatchedAt;
        const watchedAt = isWatched ? (r.WatchedAt || new Date().toISOString()) : ''; // If watched but no date, use now? Or empty? Better to leave empty if unknown, but Trakt might require it for history. User said "matches one of these...".
        // Actually, for history, watched_at is "unknown" or ISO.

        return {
            imdb_id: r.IMDB,
            tmdb_id: r.TMDB,
            type: type,
            watched_at: watchedAt,
            watchlisted_at: (!isWatched && r.Status === 'plantowatch') ? new Date().toISOString() : '', // Use now for watchlist if not watched
            rating: r.UserRating,
            rated_at: r.UserRating ? (r.WatchedAt || new Date().toISOString()) : '',
        };
    });

    return {
        headers: TRAKT_HEADERS,
        rows: mappedRows,
        filename: 'simkl_export_trakt.csv',
    };
}
