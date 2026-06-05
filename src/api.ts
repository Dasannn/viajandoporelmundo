// Thin client for the Worker API. All calls send the session cookie
// (credentials: 'same-origin') so protected data is only returned when authed.

import type { Destination, DestinationDetail } from './types'

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin' })
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

/**
 * URL to load a photo by its R2 key. The serving endpoint arrives in Phase C;
 * until then these 404 and the UI falls back to the placeholder image.
 */
export function photoUrl(key: string): string {
  return `/api/photos/${encodeURIComponent(key)}`
}

/** Fallback image shown when a destination has no cover/photos yet. */
export const PLACEHOLDER_IMG = `${import.meta.env.BASE_URL}placeholder.png`
