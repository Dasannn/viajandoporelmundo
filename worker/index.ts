// Cloudflare Worker entry point (the "main" in wrangler.jsonc).
//
// Routing model (Worker + static assets):
//   - /api/*  -> handled by the Worker (auth API)
//   - else    -> served from the ASSETS binding (the built SPA in dist/),
//                with index.html as the SPA fallback (not_found_handling).

import { handleApi } from './routes'
import type { Env } from './lib/types'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      return handleApi(request, env)
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
