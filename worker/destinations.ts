// D1-backed CRUD for travel destinations and their photo galleries.
//
// Auth model (reuses Phase A sessions):
//   - GET endpoints require a viewer session (admin also satisfies viewer).
//   - POST / PUT / DELETE require an admin session.
// Photo upload + serving lives in Phase C; here we only store/return keys.

import { authorize } from './lib/auth'
import { badRequest, json } from './lib/http'
import type { Destination, DestinationDetail, Env, Photo } from './lib/types'

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
  pin_color: string | null
  pin_icon: string | null
  pin_size: string | null
  music_id: string | null
  music_start: number | null
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
    pinColor: r.pin_color ?? null,
    pinIcon: r.pin_icon ?? null,
    pinSize: r.pin_size ?? null,
    musicId: r.music_id ?? null,
    musicStart: r.music_start ?? null,
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

// Load a destination with its full photo gallery, or null if it doesn't exist.
// Shared by getDestination and the Phase C photo endpoints.
export async function loadDetail(env: Env, id: string): Promise<DestinationDetail | null> {
  if (!env.DB) return null
  const row = await env.DB.prepare('SELECT * FROM destinations WHERE id = ?')
    .bind(id)
    .first<DestRow>()
  if (!row) return null
  const { results } = await env.DB.prepare(
    'SELECT * FROM photos WHERE destination_id = ? ORDER BY sort_order ASC, created_at ASC',
  )
    .bind(id)
    .all<PhotoRow>()
  return { ...toDestination(row), photos: (results ?? []).map(toPhoto) }
}

// GET /api/destinations/:id — one destination with its photo gallery.
export async function getDestination(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authorize(request, env, 'viewer')
  if (auth instanceof Response) return auth
  if (!env.DB) return noDb()
  const detail = await loadDetail(env, id)
  if (!detail) return notFound()
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
  pinColor: string | null
  pinIcon: string | null
  pinSize: string | null
  musicId: string | null
  musicStart: number | null
}

// Extract an 11-char YouTube video id from a pasted URL or a bare id.
// Accepts watch?v=, youtu.be/, /embed/, /shorts/, /live/ forms, or a raw id.
// Returns null when nothing valid is found.
function parseYouTubeId(raw: string): string | null {
  const s = raw.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/)
  return m ? m[1] : null
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
  // Pin appearance (all optional, validated):
  const rawColor = str(b.pinColor)
  const pinColor = rawColor && /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor.toLowerCase() : null
  const rawIcon = str(b.pinIcon)
  const pinIcon = rawIcon && rawIcon.length <= 16 ? rawIcon : null
  const rawSize = str(b.pinSize)
  const pinSize = rawSize === 's' || rawSize === 'm' || rawSize === 'l' ? rawSize : null
  // Music (optional): a YouTube id parsed from a URL or bare id, plus an
  // optional non-negative integer start offset (seconds).
  const rawMusic = str(b.musicId)
  const musicId = rawMusic ? parseYouTubeId(rawMusic) : null
  const startNum = Number(b.musicStart)
  const musicStart =
    musicId && Number.isFinite(startNum) && startNum > 0 ? Math.floor(startNum) : null
  return {
    name,
    lat,
    lng,
    visitedFrom: str(b.visitedFrom),
    visitedTo: str(b.visitedTo),
    notes: str(b.notes),
    coverKey: str(b.coverKey),
    pinColor,
    pinIcon,
    pinSize,
    musicId,
    musicStart,
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
       (id, name, lat, lng, cover_key, visited_from, visited_to, notes, created_at,
        pin_color, pin_icon, pin_size, music_id, music_start)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      input.pinColor,
      input.pinIcon,
      input.pinSize,
      input.musicId,
      input.musicStart,
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
    pinColor: input.pinColor,
    pinIcon: input.pinIcon,
    pinSize: input.pinSize,
    musicId: input.musicId,
    musicStart: input.musicStart,
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
            visited_from = ?, visited_to = ?, notes = ?,
            pin_color = ?, pin_icon = ?, pin_size = ?,
            music_id = ?, music_start = ?
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
      input.pinColor,
      input.pinIcon,
      input.pinSize,
      input.musicId,
      input.musicStart,
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
    pinColor: input.pinColor,
    pinIcon: input.pinIcon,
    pinSize: input.pinSize,
    musicId: input.musicId,
    musicStart: input.musicStart,
  }
  return json(updated)
}

// DELETE /api/destinations/:id — remove a pin, its photo rows, and R2 objects.
export async function deleteDestination(request: Request, env: Env, id: string): Promise<Response> {
  const auth = await authorize(request, env, 'admin')
  if (auth instanceof Response) return auth
  if (!env.DB) return noDb()
  // Remove the R2 objects for this destination's photos (best-effort), then
  // delete photo rows and the destination row.
  const { results } = await env.DB.prepare(
    'SELECT r2_key FROM photos WHERE destination_id = ?',
  )
    .bind(id)
    .all<{ r2_key: string }>()
  const bucket = env.BUCKET
  if (bucket && results && results.length) {
    await Promise.all(results.map((r) => bucket.delete(r.r2_key)))
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM photos WHERE destination_id = ?').bind(id),
    env.DB.prepare('DELETE FROM destinations WHERE id = ?').bind(id),
  ])
  return json({ ok: true })
}
