# PokéGlobe — Explorador del Mundo 3D

Un globo terráqueo interactivo en 3D con estética Pokemon, construido con Three.js y TanStack Start. El globo muestra la Tierra con texturas realistas de la NASA, accidentes geográficos, nubes en tiempo real y marcadores de 22 ubicaciones famosas en todo el mundo.

## Características

- 🌍 Globo 3D con texturas satelitales realistas (NASA Blue Marble)
- 🏔️ Mapas de relieve/normales para accidentes geográficos
- ☁️ Capa de nubes animada independiente
- 🔵 Atmósfera con efecto glow azul
- ⭐ Campo de estrellas de fondo (8.000 estrellas)
- 📍 22 marcadores de ubicaciones (ciudades, monumentos, naturaleza)
- 🔍 Búsqueda de ubicaciones en tiempo real
- 🎮 HUD estilo Pokémon (fuente pixel, cajas doradas)
- 🖱️ Zoom con scroll/botones, rotación con drag
- 📡 Coordenadas GPS en tiempo real al mover el cursor
- ✈️ Vuelo animado hacia ubicaciones al hacer click

## Tecnologías

- **Three.js** — renderizado 3D WebGL
- **TanStack Start / Router** — framework React SSR
- **Tailwind CSS** — estilos utilitarios
- **Press Start 2P** — fuente pixel estilo Pokémon
- **Netlify** — hosting y deploy

## Cómo correr localmente

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Controles

| Acción | Control |
|--------|---------|
| Rotar globo | Click + arrastrar |
| Zoom | Scroll de mouse o botones +/- |
| Ver ubicación | Click en marcador |
| Buscar | Panel de búsqueda (izquierda) |
| Auto-rotación | Botón PAUSAR/ROTAR |
| Reset vista | Botón 🌍 RESET |
