-- D1 (SQLite) schema for PokéGlobe travel log.
-- Apply locally:   npm run db:init:local
-- Apply to prod:   npm run db:init
-- (see package.json scripts; both wrap `wrangler d1 execute`).

PRAGMA foreign_keys = ON;

-- A pin on the globe: one visited place with dates and an optional cover photo.
CREATE TABLE IF NOT EXISTS destinations (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  lat           REAL NOT NULL,          -- -90..90
  lng           REAL NOT NULL,          -- -180..180
  cover_key     TEXT,                   -- R2 object key of the cover photo (Phase C)
  visited_from  TEXT,                   -- ISO date (YYYY-MM-DD)
  visited_to    TEXT,                   -- ISO date (YYYY-MM-DD)
  notes         TEXT,
  created_at    INTEGER NOT NULL,       -- unix seconds
  pin_color     TEXT,                   -- pin hex color (#rrggbb), null = default
  pin_icon      TEXT,                   -- shape keyword (circle/star/…) or an emoji
  pin_size      TEXT                    -- 's' | 'm' | 'l', null = default 'm'
);

-- Many photos per destination (the trip gallery).
CREATE TABLE IF NOT EXISTS photos (
  id             TEXT PRIMARY KEY,
  destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
  r2_key         TEXT NOT NULL,         -- R2 object key (Phase C)
  caption        TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL       -- unix seconds
);

CREATE INDEX IF NOT EXISTS idx_photos_destination
  ON photos (destination_id, sort_order);
