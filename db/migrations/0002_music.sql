-- Migration: per-destination background music (a YouTube video).
-- Apply once to an existing database that predates these columns:
--   npx wrangler d1 execute pokeglobe --remote --file db/migrations/0002_music.sql
--   npx wrangler d1 execute pokeglobe --local  --file db/migrations/0002_music.sql
-- (Re-running errors with "duplicate column name" — that just means it's applied.)

ALTER TABLE destinations ADD COLUMN music_id    TEXT;     -- 11-char YouTube video id, null = no music
ALTER TABLE destinations ADD COLUMN music_start INTEGER;  -- start offset in seconds, null = from the beginning
