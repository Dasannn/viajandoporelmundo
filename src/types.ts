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
