import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type { MediaItem, MediaRepository, LibraryFilters } from './db.js';
import { SCHEMA_SQL } from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'library.db');

/**
 * SQLite implementation of MediaRepository.
 * Uses better-sqlite3 for synchronous, fast, zero-config persistence.
 */
export class SQLiteRepository implements MediaRepository {
    private db: Database.Database;

    constructor(dbPath: string = DB_PATH) {
        // Ensure data directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        this.db = new Database(dbPath);
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('foreign_keys = ON');
    }

    init(): void {
        this.db.exec(SCHEMA_SQL);
        // Calendar cache table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS calendar_cache (
                month TEXT PRIMARY KEY,
                data TEXT,
                updated_at TEXT
            )
        `);
        // Migration: add poster_tmdb and poster_rpdb columns if they don't exist
        try { this.db.exec('ALTER TABLE media_items ADD COLUMN poster_tmdb TEXT'); } catch { /* already exists */ }
        try { this.db.exec('ALTER TABLE media_items ADD COLUMN poster_rpdb TEXT'); } catch { /* already exists */ }
        try { this.db.exec('ALTER TABLE media_items ADD COLUMN director TEXT'); } catch { /* already exists */ }
        console.log(`SQLite database initialized at ${this.db.name}`);
    }

    getAll(filters?: LibraryFilters): MediaItem[] {
        let sql = 'SELECT * FROM media_items WHERE 1=1';
        const params: any[] = [];

        if (filters?.type) {
            sql += ' AND type = ?';
            params.push(filters.type);
        }
        if (filters?.status) {
            sql += ' AND status = ?';
            params.push(filters.status);
        }
        if (filters?.year) {
            sql += ' AND year = ?';
            params.push(filters.year);
        }
        if (filters?.genre) {
            sql += ' AND genres LIKE ?';
            params.push(`%${filters.genre}%`);
        }
        if (filters?.search) {
            sql += ' AND title LIKE ?';
            params.push(`%${filters.search}%`);
        }

        sql += ' ORDER BY created_at DESC';

        const rows = this.db.prepare(sql).all(...params) as any[];
        return rows.map(rowToMediaItem);
    }

    getById(id: string): MediaItem | null {
        const row = this.db.prepare('SELECT * FROM media_items WHERE id = ?').get(id) as any;
        return row ? rowToMediaItem(row) : null;
    }

    add(item: MediaItem): MediaItem {
        const stmt = this.db.prepare(`
      INSERT INTO media_items (
        id, type, title, year, status, user_rating, watched_at, memo,
        tmdb_id, imdb_id, tvdb_id, mal_id, simkl_id,
        poster, poster_tmdb, poster_rpdb, genres, runtime, overview, certification, country,
        created_at, updated_at, director
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

        stmt.run(
            item.id, item.type, item.title, item.year, item.status,
            item.userRating, item.watchedAt, item.memo,
            item.tmdbId, item.imdbId, item.tvdbId, item.malId, item.simklId,
            item.poster, item.posterTmdb ?? null, item.posterRpdb ?? null,
            JSON.stringify(item.genres), item.runtime,
            item.overview, item.certification, item.country,
            item.createdAt, item.updatedAt, item.director ?? null
        );

        return item;
    }

    update(id: string, fields: Partial<MediaItem>): MediaItem | null {
        const existing = this.getById(id);
        if (!existing) return null;

        const updates: string[] = [];
        const params: any[] = [];

        const fieldMap: Record<string, string> = {
            type: 'type', title: 'title', year: 'year', status: 'status',
            userRating: 'user_rating', watchedAt: 'watched_at', memo: 'memo',
            tmdbId: 'tmdb_id', imdbId: 'imdb_id', tvdbId: 'tvdb_id',
            malId: 'mal_id', simklId: 'simkl_id', poster: 'poster',
            posterTmdb: 'poster_tmdb', posterRpdb: 'poster_rpdb',
            runtime: 'runtime', overview: 'overview',
            certification: 'certification', country: 'country',
            director: 'director',
        };

        for (const [key, col] of Object.entries(fieldMap)) {
            if (key in fields) {
                updates.push(`${col} = ?`);
                params.push((fields as any)[key]);
            }
        }

        if ('genres' in fields) {
            updates.push('genres = ?');
            params.push(JSON.stringify(fields.genres));
        }

        updates.push("updated_at = datetime('now')");
        params.push(id);

        this.db.prepare(`UPDATE media_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
        return this.getById(id);
    }

    remove(id: string): void {
        this.db.prepare('DELETE FROM media_items WHERE id = ?').run(id);
    }

    bulkUpsert(items: MediaItem[]): { inserted: number; updated: number } {
        // Lookup statements for dedup
        const findByImdb = this.db.prepare('SELECT id FROM media_items WHERE imdb_id = ? AND imdb_id IS NOT NULL LIMIT 1');
        const findByTmdb = this.db.prepare('SELECT id FROM media_items WHERE tmdb_id = ? AND tmdb_id IS NOT NULL LIMIT 1');
        const findByTitle = this.db.prepare('SELECT id FROM media_items WHERE title = ? COLLATE NOCASE AND type = ? LIMIT 1');

        const upsert = this.db.prepare(`
      INSERT INTO media_items (
        id, type, title, year, status, user_rating, watched_at, memo,
        tmdb_id, imdb_id, tvdb_id, mal_id, simkl_id,
        poster, poster_tmdb, poster_rpdb, genres, runtime, overview, certification, country,
        created_at, updated_at, director
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        user_rating = COALESCE(excluded.user_rating, media_items.user_rating),
        watched_at = COALESCE(excluded.watched_at, media_items.watched_at),
        memo = COALESCE(excluded.memo, media_items.memo),
        poster = COALESCE(excluded.poster, media_items.poster),
        poster_tmdb = COALESCE(excluded.poster_tmdb, media_items.poster_tmdb),
        poster_rpdb = COALESCE(excluded.poster_rpdb, media_items.poster_rpdb),
        genres = CASE WHEN excluded.genres != '[]' THEN excluded.genres ELSE media_items.genres END,
        runtime = COALESCE(excluded.runtime, media_items.runtime),
        overview = COALESCE(excluded.overview, media_items.overview),
        tmdb_id = COALESCE(excluded.tmdb_id, media_items.tmdb_id),
        imdb_id = COALESCE(excluded.imdb_id, media_items.imdb_id),
        tvdb_id = COALESCE(excluded.tvdb_id, media_items.tvdb_id),
        simkl_id = COALESCE(excluded.simkl_id, media_items.simkl_id),
        director = COALESCE(excluded.director, media_items.director),
        updated_at = datetime('now')
    `);

        const tx = this.db.transaction((items: MediaItem[]) => {
            let inserted = 0;
            let updated = 0;
            for (const item of items) {
                // Try to find existing item by IMDB ID, TMDB ID, or title+type
                let existingId: string | null = null;

                if (item.imdbId) {
                    const row = findByImdb.get(item.imdbId) as any;
                    if (row) existingId = row.id;
                }
                if (!existingId && item.tmdbId) {
                    const row = findByTmdb.get(item.tmdbId) as any;
                    if (row) existingId = row.id;
                }
                if (!existingId) {
                    const row = findByTitle.get(item.title, item.type) as any;
                    if (row) existingId = row.id;
                }

                // Use existing ID if found (triggers ON CONFLICT UPDATE), otherwise use new ID
                const idToUse = existingId ?? item.id;
                if (existingId) updated++; else inserted++;

                upsert.run(
                    idToUse, item.type, item.title, item.year, item.status,
                    item.userRating, item.watchedAt, item.memo,
                    item.tmdbId, item.imdbId, item.tvdbId, item.malId, item.simklId,
                    item.poster, item.posterTmdb ?? null, item.posterRpdb ?? null,
                    JSON.stringify(item.genres), item.runtime,
                    item.overview, item.certification, item.country,
                    item.createdAt, item.updatedAt, item.director ?? null
                );
            }
            return { inserted, updated };
        });

        return tx(items);
    }

    getStats(): { total: number; movies: number; series: number } {
        const total = (this.db.prepare('SELECT COUNT(*) as c FROM media_items').get() as any).c;
        const movies = (this.db.prepare("SELECT COUNT(*) as c FROM media_items WHERE type = 'movie'").get() as any).c;
        const series = (this.db.prepare("SELECT COUNT(*) as c FROM media_items WHERE type IN ('show','anime')").get() as any).c;
        return { total, movies, series };
    }

    clearAll(): void {
        this.db.prepare('DELETE FROM media_items').run();
        this.db.prepare('DELETE FROM calendar_cache').run();
        console.log('All library items cleared.');
    }

    getCalendar(month: string): { data: any; updatedAt: string } | null {
        try {
            const row = this.db.prepare('SELECT * FROM calendar_cache WHERE month = ?').get(month) as any;
            if (row) {
                return { data: JSON.parse(row.data), updatedAt: row.updated_at };
            }
        } catch (e) {
            console.error('getCalendar error:', e);
        }
        return null;
    }

    setCalendar(month: string, data: any): void {
        try {
            this.db.prepare(`
                INSERT INTO calendar_cache (month, data, updated_at)
                VALUES (?, ?, datetime('now'))
                ON CONFLICT(month) DO UPDATE SET
                data = excluded.data,
                updated_at = excluded.updated_at
            `).run(month, JSON.stringify(data));
        } catch (e) {
            console.error('setCalendar error:', e);
        }
    }
}

/** Convert a DB row to a MediaItem */
function rowToMediaItem(row: any): MediaItem {
    return {
        id: row.id,
        type: row.type,
        title: row.title,
        year: row.year,
        status: row.status,
        userRating: row.user_rating,
        watchedAt: row.watched_at,
        memo: row.memo,
        tmdbId: row.tmdb_id,
        imdbId: row.imdb_id,
        tvdbId: row.tvdb_id,
        malId: row.mal_id,
        simklId: row.simkl_id,
        poster: row.poster,
        posterTmdb: row.poster_tmdb ?? null,
        posterRpdb: row.poster_rpdb ?? null,
        genres: row.genres ? JSON.parse(row.genres) : [],
        runtime: row.runtime,
        overview: row.overview,
        certification: row.certification,
        country: row.country,
        director: row.director,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
