// Shared client types — mirror the Worker API shapes (worker/lib/types.ts).

export interface Destination {
  id: string
  name: string
  lat: number
  lng: number
  coverKey: string | null
  /** ISO date (YYYY-MM-DD) or null. */
  visitedFrom: string | null
  visitedTo: string | null
  notes: string | null
  /** Unix seconds. */
  createdAt: number
  /** Pin hex color (#rrggbb), or null for the default gold. */
  pinColor: string | null
  /** Pin shape keyword (circle/star/…) or an emoji; null = default circle. */
  pinIcon: string | null
  /** Pin size: 's' | 'm' | 'l'; null = default 'm'. */
  pinSize: string | null
  /** YouTube video id (11 chars) played when the pin opens; null = no music. */
  musicId: string | null
  /** Start offset in seconds for the music, or null to start at the beginning. */
  musicStart: number | null
}

export interface Photo {
  id: string
  /** R2 object key; load via photoUrl() (Phase C). */
  key: string
  caption: string | null
  sortOrder: number
}

export interface DestinationDetail extends Destination {
  photos: Photo[]
}

/** Editable fields for creating/updating a destination (admin). */
export type DestinationInput = Omit<Destination, 'id' | 'createdAt'>
