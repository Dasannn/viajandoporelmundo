-- Sample destinations so Phase B is verifiable before any photo is uploaded.
-- Apply locally:  npm run db:seed:local
-- These have no photos yet; the gallery shows the placeholder until Phase C.

INSERT OR IGNORE INTO destinations
  (id, name, lat, lng, cover_key, visited_from, visited_to, notes, created_at)
VALUES
  ('seed-tokyo',  'Tokio, Japón',      35.6762, 139.6503, NULL, '2024-04-01', '2024-04-10',
   'Primer viaje a Japón: Shibuya, templos y mucho ramen.', 1711929600),
  ('seed-paris',  'París, Francia',    48.8566,   2.3522, NULL, '2023-09-12', '2023-09-18',
   'Torre Eiffel, Louvre y paseos por el Sena.', 1694476800),
  ('seed-cusco',  'Cusco, Perú',      -13.5320, -71.9675, NULL, '2022-07-20', '2022-07-27',
   'Machu Picchu y el Valle Sagrado.', 1658275200);
