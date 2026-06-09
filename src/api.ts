// Thin client for the Worker API. All calls send the session cookie
// (credentials: 'same-origin') so protected data is only returned when authed.

import type { Destination, DestinationDetail, DestinationInput } from './types'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json() as Promise<T>
}

// JSON body request (POST/PUT/DELETE). Throws on non-2xx.
async function sendJson<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json() as Promise<T>
}

/** GET /api/destinations — all pins (newest first). */
export function fetchDestinations(): Promise<Destination[]> {
  return getJson<Destination[]>('/api/destinations')
}

/** GET /api/destinations/:id — one destination with its photo gallery. */
export function fetchDestination(id: string): Promise<DestinationDetail> {
  return getJson<DestinationDetail>(`/api/destinations/${encodeURIComponent(id)}`)
}

// --- admin writes (require an admin session; the server enforces this) ------

/** POST /api/destinations — create a pin. */
export function createDestination(input: DestinationInput): Promise<Destination> {
  return sendJson<Destination>('/api/destinations', 'POST', input)
}

/** PUT /api/destinations/:id — update a pin's metadata (incl. coverKey). */
export function updateDestination(id: string, input: DestinationInput): Promise<Destination> {
  return sendJson<Destination>(`/api/destinations/${encodeURIComponent(id)}`, 'PUT', input)
}

/** DELETE /api/destinations/:id — remove a pin, its photos, and R2 objects. */
export function deleteDestination(id: string): Promise<{ ok: boolean }> {
  return sendJson<{ ok: boolean }>(`/api/destinations/${encodeURIComponent(id)}`, 'DELETE')
}

/** POST /api/destinations/:id/photos — upload images; returns the updated detail. */
export async function uploadPhotos(id: string, files: File[]): Promise<DestinationDetail> {
  const form = new FormData()
  for (const f of files) form.append('file', f)
  const res = await fetch(`/api/destinations/${encodeURIComponent(id)}/photos`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  })
  if (!res.ok) throw new Error(`upload -> ${res.status}`)
  return res.json() as Promise<DestinationDetail>
}

/** Result of an image import (from URLs or from Google Drive). */
export interface ImportResult {
  detail: DestinationDetail
  imported: number
  /** Items that could not be imported (URL imports carry `url`, Drive `id`). */
  failed: { error: string; url?: string; id?: string }[]
}

/**
 * POST /api/destinations/:id/photos/import — import images from a list of URLs
 * (admin). The Worker fetches each URL server-side (no browser CORS) and stores
 * it in R2. Used by drag-and-drop of images coming from other browser tabs.
 */
export function importPhotos(id: string, urls: string[]): Promise<ImportResult> {
  return sendJson<ImportResult>(
    `/api/destinations/${encodeURIComponent(id)}/photos/import`,
    'POST',
    { urls },
  )
}

/**
 * POST /api/destinations/:id/photos/import-drive — import images picked in the
 * Google Drive Picker (admin). Sends the chosen file ids + a short-lived OAuth
 * access token; the Worker downloads each file's bytes and stores them in R2.
 */
export function importDrivePhotos(
  id: string,
  fileIds: string[],
  accessToken: string,
): Promise<ImportResult> {
  return sendJson<ImportResult>(
    `/api/destinations/${encodeURIComponent(id)}/photos/import-drive`,
    'POST',
    { fileIds, accessToken },
  )
}

/** DELETE /api/destinations/:id/photos/:photoId — returns the updated detail. */
export function deletePhoto(id: string, photoId: string): Promise<DestinationDetail> {
  return sendJson<DestinationDetail>(
    `/api/destinations/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`,
    'DELETE',
  )
}

/**
 * URL to load a photo by its R2 key. The serving endpoint arrives in Phase C;
 * until then these 404 and the UI falls back to the placeholder image.
 */
export function photoUrl(key: string): string {
  return `/api/photos/${encodeURIComponent(key)}`
}

/** Fallback image shown when a destination has no cover/photos yet. */
export const PLACEHOLDER_IMG = `${import.meta.env.BASE_URL}placeholder.png`
