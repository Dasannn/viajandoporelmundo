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
| Storage | Cloudflare R2 — trip photos (Phase C) |
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
│   ├── App.tsx                 # GlobeExplorer — Three.js scene + HUD + destination pins
│   ├── api.ts                  # Client for the Worker API (destinations, photoUrl)
│   ├── types.ts                # Shared client types (Destination, Photo, DestinationDetail)
│   ├── auth/AuthGate.tsx       # Login gate + useAuth() (Phase A)
│   ├── components/
│   │   └── DestinationModal.tsx# Pin gallery modal (cover, dates, photo grid, lightbox)
│   └── styles.css              # Tailwind import + all HUD/globe/auth/modal styles
├── worker                      # Cloudflare Worker (the /api/* backend)
│   ├── index.ts                # Entry: routes /api/* to handleApi, else serves ASSETS (dist/)
│   ├── routes.ts               # API router (auth + destinations)
│   ├── destinations.ts         # D1-backed CRUD for destinations + photos (Phase B)
│   └── lib/                    # session.ts, crypto.ts, http.ts, types.ts (Env bindings)
├── db
│   ├── schema.sql              # D1 schema (destinations, photos)
│   └── seed.sql                # Sample destinations for local verification
├── .dev.vars                   # LOCAL Worker secrets (gitignored — never commit)
├── wrangler.jsonc              # Worker + assets + D1 binding config
├── .scratch/genmap.ps1         # Map texture generator (PowerShell + .NET, not deployed)
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
  (`GET /api/destinations/:id`). Photo serving from R2 arrives in Phase C; until then galleries
  show the placeholder image.
- **API auth**: GET endpoints require a viewer session; writes (POST/PUT/DELETE) require admin.
  See `worker/destinations.ts` `authorize()` and `roleSatisfies()` in `worker/lib/session.ts`.

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
```

## Conventions

- Components: PascalCase. Hooks/utilities: camelCase.
- Tailwind utility classes; bespoke HUD styles live in `src/styles.css`.
- TypeScript strict mode; type-only imports use the `type` keyword.
