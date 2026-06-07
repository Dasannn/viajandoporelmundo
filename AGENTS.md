# AGENTS.md

Overview of the project structure for developers and AI agents working on this codebase.

## Project Overview

**PokéGlobe** — An interactive 3D Earth globe with a Pokémon-style UI and a private travel
log. The globe renders the real geography of Earth using a stylized equirectangular texture.
The SPA is gated behind a server-verified password; a Cloudflare Worker exposes the auth and
data API, with a D1 database for destinations and R2 for trip photos.

### Tech Stack

| Layer | Technology |
|-------|------------|
| 3D | Three.js (WebGL) |
| Frontend | React 19 |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 |
| Language | TypeScript 5 (strict mode) |
| Backend | Cloudflare Worker (`worker/`, native `fetch` handler) |
| Data | Cloudflare D1 (SQLite) — destinations & photos |
| Storage | Cloudflare R2 — trip photos (private, served via the Worker) |
| Hosting | Cloudflare Pages/Workers (static assets + Worker API) |

## Directory Structure

```
├── index.html                  # Vite SPA entry (loads /src/main.tsx, Inter font, title)
├── public
│   ├── pokemon-map.png         # Equirectangular Pokémon-style Earth texture (used by the globe)
│   ├── favicon.ico
│   └── placeholder.png         # Fallback image for destinations without photos
├── src
│   ├── main.tsx                # React root: <AuthGate> wraps <App /> into #root
│   ├── App.tsx                 # GlobeExplorer — Three.js scene + HUD + pins + admin mode
│   ├── api.ts                  # Client for the Worker API (destinations, photos, admin writes)
│   ├── types.ts                # Shared client types (Destination, Photo, DestinationInput…)
│   ├── auth/AuthGate.tsx       # Login gate + useAuth() (Phase A)
│   ├── admin/PinEditor.tsx     # Admin create/edit pin + photo upload/manage (Phase C)
│   ├── components/
│   │   └── DestinationModal.tsx# Pin gallery modal (cover, dates, photo grid, lightbox)
│   └── styles.css              # Tailwind import + all HUD/globe/auth/modal/admin styles
├── worker                      # Cloudflare Worker (the /api/* backend)
│   ├── index.ts                # Entry: routes /api/* to handleApi, else serves ASSETS (dist/)
│   ├── routes.ts               # API router (auth + destinations + photos)
│   ├── destinations.ts         # D1-backed CRUD for destinations (Phase B)
│   ├── photos.ts               # R2 upload/serve/delete for galleries (Phase C, admin writes)
│   └── lib/                    # auth.ts, session.ts, crypto.ts, http.ts, types.ts (Env bindings)
├── db
│   ├── schema.sql              # D1 schema (destinations, photos)
│   └── seed.sql                # Sample destinations for local verification
├── .dev.vars                   # LOCAL Worker secrets (gitignored — never commit)
├── wrangler.jsonc              # Worker + assets + D1 + R2 binding config
├── .scratch/genmap.ps1         # Map texture generator (PowerShell + .NET, not deployed)
├── .scratch/verify-phasec.mts  # Workerd-free test of the photo API (esbuild + node:sqlite)
├── vite.config.ts              # Vite config: react + tailwind plugins, base '/'
└── tsconfig.json               # TypeScript config (strict, ES2022, bundler resolution)
```

## Key Concepts

- **Single component**: `src/App.tsx` holds the whole app. A `useEffect` builds the Three.js
  scene (twinkling star shader + shooting stars, camera, `OrbitControls`, lights, the textured
  globe, a procedural cloud layer, and a Fresnel-shader atmosphere glow) and the render loop;
  React state drives only the HUD (coords, zoom %, auto-rotate, loading).
- **Globe texture**: loaded from `` `${import.meta.env.BASE_URL}pokemon-map.png` `` so it works
  under any deploy base. It is a real-geography biome map (Natural Earth NE2 land cover + HYP
  elevation, quantized to a flat Pokémon palette). Regenerate via `.scratch/genmap.ps1`.
- **Deploy base path**: `base` in `vite.config.ts` is `'/'` (hosted on Cloudflare at the root).
- **Auth gate (Phase A)**: `src/auth/AuthGate.tsx` calls `/api/session` on load and shows a
  password screen until a valid signed cookie exists. The visitor password and admin credentials
  are Worker secrets (`.dev.vars` locally; Cloudflare dashboard in prod) — never in the bundle.
- **Destinations & pins (Phase B)**: `App.tsx` fetches `/api/destinations` and renders a glowing
  pin per place. `latLngToVec3()` is the exact inverse of the lat/lng read in `handleMouseMove`
  (keep them in sync). Clicking a pin opens `DestinationModal` with the photo gallery
  (`GET /api/destinations/:id`).
- **Photos (Phase C)**: trip photos live in R2 and are **never public** — they are served by the
  Worker at `GET /api/photos/<key>` only to an authenticated viewer (no session → 401), with
  `Cache-Control: private`. Uploads (`POST /api/destinations/:id/photos`, multipart, admin-only)
  store each image at `dest/<id>/<uuid>.<ext>`, insert a `photos` row, and auto-set the cover when
  none exists. `DELETE /api/destinations/:id/photos/:photoId` removes the R2 object + row (and
  clears the cover if it pointed there); deleting a destination cleans up all its R2 objects.
- **Admin mode (Phase C)**: when `useAuth().isAdmin` is true, `App.tsx` shows an admin toolbar.
  "Nuevo pin" enters placing mode — a click on the globe captures lat/lng (same math as
  `handleMouseMove`) and opens `src/admin/PinEditor.tsx` to create the destination, then upload
  and manage photos. Editing an existing pin is reached via the "Editar" button in
  `DestinationModal`. All write calls require an admin session; the server enforces this, so a
  viewer who pokes the API still gets 401/403.
- **API auth**: GET endpoints require a viewer session; writes (POST/PUT/DELETE) require admin.
  The shared guard is `worker/lib/auth.ts` `authorize()` + `roleSatisfies()` in
  `worker/lib/session.ts`.

## Development Commands

```bash
npm install
npm run dev        # Vite dev server only (HUD/globe; /api/* won't work)
npm run dev:full   # Vite + Worker together (concurrently) — needed for auth/data
npm run build      # Production build to dist/
npm run deploy     # wrangler versions upload (set as Deploy command in Cloudflare)

# D1 (first time): create the DB, paste its id into wrangler.jsonc, then:
npm run db:init:local   # apply db/schema.sql to the local D1
npm run db:seed:local   # load sample destinations (db/seed.sql)
npm run db:init         # apply schema to the remote/production D1

# R2 (first time, for Phase C photos): enable R2 in the Cloudflare dashboard, then:
npx wrangler r2 bucket create pokeglobe-photos   # name must match wrangler.jsonc

# Verify the photo API without workerd (esbuild bundle + Node 24 / node:sqlite):
npx esbuild .scratch/verify-phasec.mts --bundle --platform=node --format=esm --outfile=$env:TEMP\verify-phasec.mjs
node $env:TEMP\verify-phasec.mjs
```

## Conventions

- Components: PascalCase. Hooks/utilities: camelCase.
- Tailwind utility classes; bespoke HUD styles live in `src/styles.css`.
- TypeScript strict mode; type-only imports use the `type` keyword.
