# AGENTS.md

Overview of the project structure for developers and AI agents working on this codebase.

## Project Overview

**PokéGlobe** — An interactive 3D Earth globe with a Pokémon-style UI. The globe renders the real geography of Earth using a stylized equirectangular texture. Pure client-side single-page app; no backend, database, or server-side rendering.

### Tech Stack

| Layer | Technology |
|-------|------------|
| 3D | Three.js (WebGL) |
| Frontend | React 19 |
| Build | Vite 7 |
| Styling | Tailwind CSS 4 |
| Language | TypeScript 5 (strict mode) |
| Hosting | GitHub Pages (deployed via GitHub Actions) |

## Directory Structure

```
├── index.html                  # Vite SPA entry (loads /src/main.tsx, Inter font, title)
├── public
│   ├── pokemon-map.png         # Equirectangular Pokémon-style Earth texture (used by the globe)
│   ├── favicon.ico
│   └── placeholder.png
├── src
│   ├── main.tsx                # React root: mounts <App /> into #root
│   ├── App.tsx                 # GlobeExplorer — the entire app (Three.js scene + HUD)
│   └── styles.css              # Tailwind import + all HUD/globe styles
├── .github/workflows/deploy.yml # Builds and deploys dist/ to GitHub Pages on push to main
├── .scratch/genmap.ps1         # Map texture generator (PowerShell + .NET, not deployed)
├── vite.config.ts              # Vite config: react + tailwind plugins, base '/viajandoporelmundo/'
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
- **Deploy base path**: `base` in `vite.config.ts` is `'/'` (hosted on Cloudflare Pages at the
  root). For a GitHub Pages *project* sub-path it would need `'/viajandoporelmundo/'` instead.

## Development Commands

```bash
npm install
npm run dev      # Vite dev server on http://localhost:3000
npm run build    # Production build to dist/
npm run preview  # Preview the production build locally
```

## Conventions

- Components: PascalCase. Hooks/utilities: camelCase.
- Tailwind utility classes; bespoke HUD styles live in `src/styles.css`.
- TypeScript strict mode; type-only imports use the `type` keyword.
