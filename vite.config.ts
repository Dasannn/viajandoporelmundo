import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Deployed to Cloudflare Pages, which serves the site at the root path,
// so assets are served from '/'.
export default defineConfig({
  base: '/',
  plugins: [viteReact(), tailwindcss()],
})
