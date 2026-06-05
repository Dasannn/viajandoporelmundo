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

/** A visited place rendered as a pin on the globe (API shape, camelCase). */
export interface Destination {
  id: string
  name: string
  lat: number
  lng: number
  /** R2 object key of the cover photo, or null. */
  coverKey: string | null
  /** ISO date (YYYY-MM-DD) or null. */
  visitedFrom: string | null
  visitedTo: string | null
  notes: string | null
  /** Unix seconds. */
  createdAt: number
}

/** A single gallery photo belonging to a destination (API shape). */
export interface Photo {
  id: string
  /** R2 object key; the client loads it via /api/photos/:key (Phase C). */
  key: string
  caption: string | null
  sortOrder: number
}

/** A destination with its full photo gallery (GET /api/destinations/:id). */
export interface DestinationDetail extends Destination {
  photos: Photo[]
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
