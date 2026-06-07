-- Migration: per-pin appearance (color / icon-or-emoji / size).
-- Apply once to an existing database that predates these columns:
--   npx wrangler d1 execute pokeglobe --remote --file db/migrations/0001_pin_style.sql
--   npx wrangler d1 execute pokeglobe --local  --file db/migrations/0001_pin_style.sql
-- (Re-running errors with "duplicate column name" — that just means it's applied.)

ALTER TABLE destinations ADD COLUMN pin_color TEXT;
ALTER TABLE destinations ADD COLUMN pin_icon  TEXT;
ALTER TABLE destinations ADD COLUMN pin_size  TEXT;
