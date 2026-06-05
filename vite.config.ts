import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Deployed to Cloudflare Pages, which serves the site at the root path,
// so assets are served from '/'.
export default defineConfig({
  base: '/',
  plugins: [viteReact(), tailwindcss()],
  server: {
    port: 3000,
    // During `npm run dev:full`, the Worker backend runs under `wrangler dev`
    // on :8787. Proxy API calls there so the browser stays on :3000 with
    // React hot-reload.
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  build: {
    // No source maps in production: the bundle stays readable either way, but
    // there is no reason to ship a pretty-printed map. Real protection is that
    // the bundle contains no secrets and all data requires a server session.
    sourcemap: false,
  },
})
