/** SQL schema for the media_items table. */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS media_items (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK(type IN ('movie','show','anime')),
  title         TEXT NOT NULL,
  year          INTEGER,
  status        TEXT NOT NULL DEFAULT 'plantowatch'
                CHECK(status IN ('completed','watching','plantowatch','hold','dropped')),
  user_rating   REAL,
  watched_at    TEXT,
  memo          TEXT,
  -- Cross-platform IDs
  tmdb_id       INTEGER,
  imdb_id       TEXT,
  tvdb_id       INTEGER,
  mal_id        INTEGER,
  simkl_id      INTEGER,
  -- Metadata
  poster        TEXT,
  poster_tmdb   TEXT,
  poster_rpdb   TEXT,
  genres        TEXT,        -- JSON array stored as string
  runtime       INTEGER,
  overview      TEXT,
  certification TEXT,
  country       TEXT,
  director      TEXT,
  -- Timestamps
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_media_type   ON media_items(type);
CREATE INDEX IF NOT EXISTS idx_media_status ON media_items(status);
CREATE INDEX IF NOT EXISTS idx_media_year   ON media_items(year);
CREATE INDEX IF NOT EXISTS idx_media_tmdb   ON media_items(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_media_imdb   ON media_items(imdb_id);
`;

