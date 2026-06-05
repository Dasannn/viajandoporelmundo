// Shared types for Cloudflare Pages Functions (backend).
// `Env` mirrors the bindings/secrets configured in wrangler.toml + .dev.vars
// (local) and the Cloudflare Pages dashboard (production).

export type Role = 'viewer' | 'admin'

export interface SessionData {
  role: Role
  /** Issued-at (unix seconds). */
  iat: number
  /** Expiry (unix seconds). */
  exp: number
}

export interface Env {
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

/**
 * Data attached to the request by _middleware.ts and read by endpoints.
 * Declared as a `type` (not `interface`) so it satisfies the
 * `Record<string, unknown>` constraint on PagesFunction's Data generic.
 */
export type MiddlewareData = {
  session: SessionData | null
}
