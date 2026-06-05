// Shared types for the Cloudflare Worker backend.
// `Env` mirrors the bindings/secrets configured in wrangler.jsonc + .dev.vars
// (local) and the Cloudflare dashboard (production).

export type Role = 'viewer' | 'admin'

export interface SessionData {
  role: Role
  /** Issued-at (unix seconds). */
  iat: number
  /** Expiry (unix seconds). */
  exp: number
}

export interface Env {
  /** Static assets binding (serves dist/ with SPA fallback). */
  ASSETS: Fetcher

  /** Secret used to sign session cookies (HMAC-SHA256). */
  SESSION_SECRET: string
  /** Visitor gate password (plaintext secret, or a `pbkdf2$...` hash). */
  VIEWER_PASSWORD: string
  /** Admin username. */
  ADMIN_USER: string
  /** Admin password — plaintext secret (simple) ... */
  ADMIN_PASSWORD?: string
  /** ...or a PBKDF2 hash (`pbkdf2$iter$salt$hash`, see scripts/hash-password.mjs). Takes precedence. */
  ADMIN_PASSWORD_HASH?: string

  // --- Phase B/C bindings (optional until the resources are created) ---
  DB?: D1Database
  BUCKET?: R2Bucket
}
