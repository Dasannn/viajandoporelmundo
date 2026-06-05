# PokéGlobe — Explorador del Mundo 3D

Un globo terráqueo interactivo en 3D con estética Pokémon, construido con **Three.js** y **React + Vite**. El globo muestra la geografía real de la Tierra con una textura estilizada estilo Pokémon (océanos turquesa, costas de arena, casquetes polares nevados).

## Características

- 🌍 Globo 3D con **geografía real** en estilo Pokémon: biomas con datos reales (selvas, desiertos, sabanas, taiga, tundra)
- ⛰️ Cordilleras reales por elevación (Andes, Rockies, Himalaya, Alpes…), costas de arena y casquetes polares
- ☁️ Capa de nubes en movimiento sobre el planeta
- 🌟 Halo atmosférico turquesa con efecto Fresnel
- ✨ Campo de estrellas con parpadeo y estrellas fugaces ocasionales
- 🖱️ Rotación con arrastre y zoom (scroll o botones +/−)
- 🔄 Auto-rotación activable y botón de reset de vista
- 📡 Coordenadas GPS en tiempo real al mover el cursor
- 🎮 HUD con estética Pokémon

## Tecnologías

- **Three.js** — renderizado 3D WebGL
- **React 19 + Vite** — UI y bundling
- **Tailwind CSS 4** — estilos utilitarios
- **Cloudflare Pages** — hosting (deploy automático en cada push a `main`)

## Cómo correr localmente

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Despliegue (Cloudflare Pages)

El sitio está alojado en **Cloudflare Pages** y se publica automáticamente en cada push a `main`.

Configuración del proyecto en el panel de Cloudflare Pages:

| Ajuste | Valor |
|--------|-------|
| Rama de producción | `main` |
| Comando de build | `npm run build` |
| Directorio de salida | `dist` |

> El `base` del proyecto está fijado a `/` en `vite.config.ts` porque Cloudflare Pages sirve el sitio desde la raíz del dominio. El dominio personalizado (`www.jsunmeforever.dpdns.org`) se configura en el panel de Cloudflare Pages (**Custom domains**), no mediante un archivo `CNAME`.

## Controles

| Acción | Control |
|--------|---------|
| Rotar globo | Click + arrastrar |
| Zoom | Scroll de mouse o botones +/− |
| Auto-rotación | Botón PAUSAR/ROTAR |
| Reset vista | Botón 🌍 RESET |

## Regenerar la textura del mapa

La textura `public/pokemon-map.png` se genera con [`.scratch/genmap.ps1`](.scratch/genmap.ps1) (PowerShell + .NET). Combina los vectores de costa de Natural Earth 50m con dos rasters reales (color de cobertura `NE2` + elevación `HYP`) y los cuantiza a una paleta plana Pokémon de biomas. Edita los umbrales/paleta en el bloque C# del script y vuelve a ejecutarlo. (Requiere los datos en `.scratch/`, que está en `.gitignore`.)
