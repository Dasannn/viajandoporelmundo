# PokéGlobe — Explorador del Mundo 3D

Un globo terráqueo interactivo en 3D con estética Pokémon, construido con **Three.js** y **React + Vite**. El globo muestra la geografía real de la Tierra con una textura estilizada estilo Pokémon (océanos turquesa, costas de arena, casquetes polares nevados).

## Características

- 🌍 Globo 3D con geografía real de la Tierra en estilo Pokémon (textura equirectangular)
- 🏖️ Costas de arena y casquetes polares nevados
- 🔵 Atmósfera con efecto glow turquesa
- ⭐ Campo de estrellas de fondo (8.000 estrellas)
- 🖱️ Rotación con arrastre y zoom (scroll o botones +/−)
- 🔄 Auto-rotación activable y botón de reset de vista
- 📡 Coordenadas GPS en tiempo real al mover el cursor
- 🎮 HUD con estética Pokémon

## Tecnologías

- **Three.js** — renderizado 3D WebGL
- **React 19 + Vite** — UI y bundling
- **Tailwind CSS 4** — estilos utilitarios
- **GitHub Pages** — hosting (deploy automático con GitHub Actions)

## Cómo correr localmente

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Despliegue (GitHub Pages)

El sitio se publica automáticamente con GitHub Actions en cada push a `main` (ver [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

**Configuración única** (una sola vez): en el repositorio, ve a **Settings → Pages → Build and deployment → Source** y selecciona **GitHub Actions**.

> El `base` del proyecto está fijado a `/viajandoporelmundo/` en `vite.config.ts` para que coincida con la ruta del *project page*. Si renombras el repositorio, actualiza ese valor.

## Controles

| Acción | Control |
|--------|---------|
| Rotar globo | Click + arrastrar |
| Zoom | Scroll de mouse o botones +/− |
| Auto-rotación | Botón PAUSAR/ROTAR |
| Reset vista | Botón 🌍 RESET |

## Regenerar la textura del mapa

La textura `public/pokemon-map.png` se genera con [`.scratch/genmap.ps1`](.scratch/genmap.ps1) (PowerShell + .NET), rasterizando las costas reales de Natural Earth con una paleta Pokémon. Edita la paleta en el bloque C# del script y vuelve a ejecutarlo para ajustar colores.
