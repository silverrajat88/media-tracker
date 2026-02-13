/**
 * MediaItem — the canonical data model for all library items.
 * All cross-platform IDs are stored to enable exports to any service.
 */
export interface MediaItem {
  id: string;
  type: 'movie' | 'show' | 'anime';
  title: string;
  year: number | null;
  status: 'completed' | 'watching' | 'plantowatch' | 'hold' | 'dropped';
  userRating: number | null;
  watchedAt: string | null;
  memo: string | null;
  // Cross-platform IDs
  tmdbId: number | null;
  imdbId: string | null;
  tvdbId: number | null;
  malId: number | null;
  simklId: number | null;
  // Metadata
  poster: string | null;
  genres: string[];
  runtime: number | null;
  overview: string | null;
  certification: string | null;
  country: string | null;
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface LibraryFilters {
  type?: string;
  status?: string;
  year?: number;
  genre?: string;
  search?: string;
}

/**
 * MediaRepository — abstract interface for persistence.
 * Implement this for SQLite, Postgres, or any other backend.
 */
export interface MediaRepository {
  /** Initialize the database (create tables, etc.) */
  init(): void;

  /** Get all items, optionally filtered */
  getAll(filters?: LibraryFilters): MediaItem[];

  /** Get a single item by ID */
  getById(id: string): MediaItem | null;

  /** Add a new item. Returns the created item. */
  add(item: MediaItem): MediaItem;

  /** Update fields on an existing item. Returns the updated item. */
  update(id: string, fields: Partial<MediaItem>): MediaItem | null;

  /** Remove an item by ID */
  remove(id: string): void;

  /** Bulk upsert (for imports). Returns count of items upserted. */
  bulkUpsert(items: MediaItem[]): number;

  /** Get summary stats */
  getStats(): { total: number; movies: number; series: number };
}
