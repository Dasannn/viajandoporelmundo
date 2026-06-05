// D1-backed CRUD for travel destinations and their photo galleries.
//
// Auth model (reuses Phase A sessions):
//   - GET endpoints require a viewer session (admin also satisfies viewer).
//   - POST / PUT / DELETE require an admin session.
// Photo upload + serving lives in Phase C; here we only store/return keys.

import { badRequest, forbidden, json, unauthorized } from './lib/http'
import { getSessionCookie, roleSatisfies, verifySessionToken } from './lib/session'
import type { Destination, DestinationDetail, Env, Photo, Role } from './lib/types'

// Verify the session cookie and enforce a minimum role.
// Returns the session role on success, or a short-circuit Response (401/403).
async function authorize(request: Request, env: Env, need: Role): Promise<Role | Response> {
  const s = await verifySessionToken(env, getSessionCookie(request))
  if (!s) return unauthorized()
  if (!roleSatisfies(s.role, need)) return forbidden()
  return s.role
}

const noDb = (): Response => json({ error: 'database_unavailable' }, { status: 503 })
const notFound = (): Response => json({ error: 'not_found' }, { status: 404 })

// --- row shapes (snake_case in D1) -> API shapes (camelCase) ----------------

interface DestRow {
  id: string
  name: string
  lat: number
  lng: number
  cover_key: string | null
  visited_from: string | null
  visited_to: string | null
  notes: string | null
  created_at: number
}

interface PhotoRow {
  id: string
  destination_id: string
  r2_key: string
  caption: string | null
  sort_order: number
  created_at: number
}

function toDestination(r: DestRow): Destination {
  return {
    id: r.id,
    name: r.name,
    lat: r.lat,
    lng: r.lng,
    coverKey: r.cover_key,
    visitedFrom: r.visited_from,
    visitedTo: r.visited_to,
    notes: r.notes,
    createdAt: r.created_at,
  }
}

function toPhoto(r: PhotoRow): Photo {
  return { id: r.id, key: r.r2_key, caption: r.caption, sortOrder: r.sort_order }
}

// --- read endpoints (viewer+) ----------------------------------------------

// GET /api/destinations — list all pins (newest first).
export async function listDestinations(request: Request, env: Env): Promise<Response> {
  const auth = await authorize(request, env, 'viewer')
  if (auth instanceof Response) return auth
  if (!env.DB) return noDb()
  const { results } = await env.DB.prepare(
    'SELECT * FROM destinations ORDER BY created_at DESC',
  ).all<DestRow>()
  return json((results ?? []).map(toDestination))
}

// GET /api/destinations/:id — one destination with its photo gallery.
export async function getDestination(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authorize(request, env, 'viewer')
  if (auth instanceof Response) return auth
  if (!env.DB) return noDb()
  const row = await env.DB.prepare('SELECT * FROM destinations WHERE id = ?')
    .bind(id)
    .first<DestRow>()
  if (!row) return notFound()
  const { results } = await env.DB.prepare(
    'SELECT * FROM photos WHERE destination_id = ? ORDER BY sort_order ASC, created_at ASC',
  )
    .bind(id)
    .all<PhotoRow>()
  const detail: DestinationDetail = {
    ...toDestination(row),
    photos: (results ?? []).map(toPhoto),
  }
  return json(detail)
}

// --- write endpoints (admin) -----------------------------------------------

interface DestInput {
  name: string
  lat: number
  lng: number
  visitedFrom: string | null
  visitedTo: string | null
  notes: string | null
  coverKey: string | null
}

// Validate the shared create/update body. Returns null when invalid.
function parseBody(body: unknown): DestInput | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  const lat = Number(b.lat)
  const lng = Number(b.lng)
  if (!name) return null
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return null
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) return null
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    name,
    lat,
    lng,
    visitedFrom: str(b.visitedFrom),
    visitedTo: str(b.visitedTo),
    notes: str(b.notes),
    coverKey: str(b.coverKey),
  }
}

// POST /api/destinations — create a new pin.
export async function createDestination(request: Request, env: Env): Promise<Response> {
  const auth = await authorize(request, env, 'admin')
  if (auth instanceof Response) return auth
  if (!env.DB) return noDb()
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return badRequest()
  }
  const input = parseBody(raw)
  if (!input) return badRequest('invalid_destination')

  const id = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  await env.DB.prepare(
    `INSERT INTO destinations
       (id, name, lat, lng, cover_key, visited_from, visited_to, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      input.name,
      input.lat,
      input.lng,
      input.coverKey,
      input.visitedFrom,
      input.visitedTo,
      input.notes,
      now,
    )
    .run()

  const created: Destination = {
    id,
    name: input.name,
    lat: input.lat,
    lng: input.lng,
    coverKey: input.coverKey,
    visitedFrom: input.visitedFrom,
    visitedTo: input.visitedTo,
    notes: input.notes,
    createdAt: now,
  }
  return json(created, { status: 201 })
}

// PUT /api/destinations/:id — update an existing pin's metadata.
export async function updateDestination(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authorize(request, env, 'admin')
  if (auth instanceof Response) return auth
  if (!env.DB) return noDb()
  const existing = await env.DB.prepare('SELECT created_at FROM destinations WHERE id = ?')
    .bind(id)
    .first<{ created_at: number }>()
  if (!existing) return notFound()
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return badRequest()
  }
  const input = parseBody(raw)
  if (!input) return badRequest('invalid_destination')

  await env.DB.prepare(
    `UPDATE destinations
        SET name = ?, lat = ?, lng = ?, cover_key = ?,
            visited_from = ?, visited_to = ?, notes = ?
      WHERE id = ?`,
  )
    .bind(
      input.name,
      input.lat,
      input.lng,
      input.coverKey,
      input.visitedFrom,
      input.visitedTo,
      input.notes,
      id,
    )
    .run()

  const updated: Destination = {
    id,
    name: input.name,
    lat: input.lat,
    lng: input.lng,
    coverKey: input.coverKey,
    visitedFrom: input.visitedFrom,
    visitedTo: input.visitedTo,
    notes: input.notes,
    createdAt: existing.created_at,
  }
  return json(updated)
}

// DELETE /api/destinations/:id — remove a pin and its photo rows.
export async function deleteDestination(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authorize(request, env, 'admin')
  if (auth instanceof Response) return auth
  if (!env.DB) return noDb()
  // Delete photo rows first (explicit, in case FK cascade is off), then the row.
  // R2 object cleanup is handled by the Phase C upload/delete flow.
  await env.DB.batch([
    env.DB.prepare('DELETE FROM photos WHERE destination_id = ?').bind(id),
    env.DB.prepare('DELETE FROM destinations WHERE id = ?').bind(id),
  ])
  return json({ ok: true })
}
