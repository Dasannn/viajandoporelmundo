import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Project is deployed to GitHub Pages at https://dasannn.github.io/viajandoporelmundo/
// so all assets must be served from that sub-path.
export default defineConfig({
  base: '/viajandoporelmundo/',
  plugins: [viteReact(), tailwindcss()],
})
