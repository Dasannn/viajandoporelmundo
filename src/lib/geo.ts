// Geography helpers for the timeline/continent filter.
// Continent is derived from a pin's lat/lng with approximate bounding boxes —
// good enough for placing travel pins on the right continent.

import type { Destination } from '../types'

export interface ContinentMeta {
  id: string
  label: string
  emoji: string
}

export const CONTINENTS: ContinentMeta[] = [
  { id: 'na', label: 'Norteamérica', emoji: '🌎' },
  { id: 'sa', label: 'Sudamérica', emoji: '🌎' },
  { id: 'eu', label: 'Europa', emoji: '🌍' },
  { id: 'af', label: 'África', emoji: '🌍' },
  { id: 'as', label: 'Asia', emoji: '🌏' },
  { id: 'oc', label: 'Oceanía', emoji: '🌏' },
  { id: 'an', label: 'Antártida', emoji: '🧊' },
]

const LABELS: Record<string, ContinentMeta> = Object.fromEntries(
  CONTINENTS.map((c) => [c.id, c]),
)

export function continentMeta(id: string): ContinentMeta {
  return LABELS[id] ?? { id, label: id, emoji: '🌐' }
}

// Ordered [continent, latMin, latMax, lngMin, lngMax]; first containing box wins.
const BOXES: [string, number, number, number, number][] = [
  ['oc', -50, 0, 110, 180], // Australia / NZ / PNG
  ['oc', -30, 25, 155, 180], // Pacific islands near the dateline
  ['sa', -56, 13, -82, -34],
  ['na', 7, 84, -168, -52], // incl. Central America + Greenland-ish
  ['eu', 36, 72, -25, 45],
  ['af', -36, 37, -18, 52],
  ['as', -11, 82, 45, 180], // incl. SE Asia / Indonesia
  ['as', 5, 45, 26, 63], // Middle East
]

/** Best-guess continent id for a coordinate. */
export function continentOf(lat: number, lng: number): string {
  if (lat <= -60) return 'an'
  for (const [id, la, lb, ga, gb] of BOXES) {
    if (lat >= la && lat <= lb && lng >= ga && lng <= gb) return id
  }
  // Fallback by longitude band.
  if (lng < -34) return lat > 13 ? 'na' : 'sa'
  if (lng < 45) return lat > 35 ? 'eu' : 'af'
  return 'as'
}

/** The year a trip is filed under (visitedFrom, else visitedTo). null = sin fecha. */
export function tripYear(d: Pick<Destination, 'visitedFrom' | 'visitedTo'>): number | null {
  const iso = d.visitedFrom || d.visitedTo
  if (!iso) return null
  const y = Number(iso.slice(0, 4))
  return Number.isFinite(y) && y > 1000 ? y : null
}
