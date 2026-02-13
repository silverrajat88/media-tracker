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
        poster, genres, runtime, overview, certification, country,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?
      )
    `);

        stmt.run(
            item.id, item.type, item.title, item.year, item.status,
            item.userRating, item.watchedAt, item.memo,
            item.tmdbId, item.imdbId, item.tvdbId, item.malId, item.simklId,
            item.poster, JSON.stringify(item.genres), item.runtime,
            item.overview, item.certification, item.country,
            item.createdAt, item.updatedAt,
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
            runtime: 'runtime', overview: 'overview',
            certification: 'certification', country: 'country',
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

    bulkUpsert(items: MediaItem[]): number {
        const upsert = this.db.prepare(`
      INSERT INTO media_items (
        id, type, title, year, status, user_rating, watched_at, memo,
        tmdb_id, imdb_id, tvdb_id, mal_id, simkl_id,
        poster, genres, runtime, overview, certification, country,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        user_rating = excluded.user_rating,
        watched_at = excluded.watched_at,
        memo = excluded.memo,
        poster = excluded.poster,
        genres = excluded.genres,
        runtime = excluded.runtime,
        overview = excluded.overview,
        updated_at = datetime('now')
    `);

        const tx = this.db.transaction((items: MediaItem[]) => {
            let count = 0;
            for (const item of items) {
                upsert.run(
                    item.id, item.type, item.title, item.year, item.status,
                    item.userRating, item.watchedAt, item.memo,
                    item.tmdbId, item.imdbId, item.tvdbId, item.malId, item.simklId,
                    item.poster, JSON.stringify(item.genres), item.runtime,
                    item.overview, item.certification, item.country,
                    item.createdAt, item.updatedAt,
                );
                count++;
            }
            return count;
        });

        return tx(items);
    }

    getStats(): { total: number; movies: number; series: number } {
        const total = (this.db.prepare('SELECT COUNT(*) as c FROM media_items').get() as any).c;
        const movies = (this.db.prepare("SELECT COUNT(*) as c FROM media_items WHERE type = 'movie'").get() as any).c;
        const series = (this.db.prepare("SELECT COUNT(*) as c FROM media_items WHERE type IN ('show','anime')").get() as any).c;
        return { total, movies, series };
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
        genres: row.genres ? JSON.parse(row.genres) : [],
        runtime: row.runtime,
        overview: row.overview,
        certification: row.certification,
        country: row.country,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
