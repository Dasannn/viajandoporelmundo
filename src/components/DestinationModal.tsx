import { useState } from 'react'
import type { DestinationDetail } from '../types'
import { PLACEHOLDER_IMG, photoUrl } from '../api'

interface Props {
  /** The open destination (with photos), or null when closed. */
  detail: DestinationDetail | null
  /** True while the full detail (photos) is still loading. */
  loading: boolean
  onClose: () => void
}

// "1 abr 2024 – 10 abr 2024", or a single date, or "" when unknown.
function formatRange(from: string | null, to: string | null): string {
  const fmt = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  if (from && to) return `${fmt(from)} – ${fmt(to)}`
  if (from) return fmt(from)
  if (to) return fmt(to)
  return ''
}

/** Swaps a broken/missing photo for the placeholder image. */
function imgFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const el = e.currentTarget
  if (el.src.endsWith('placeholder.png')) return
  el.src = PLACEHOLDER_IMG
}

export default function DestinationModal({ detail, loading, onClose }: Props) {
  const [lightbox, setLightbox] = useState<string | null>(null)
  if (!detail) return null

  const dates = formatRange(detail.visitedFrom, detail.visitedTo)
  const cover = detail.coverKey
    ? photoUrl(detail.coverKey)
    : detail.photos[0]
      ? photoUrl(detail.photos[0].key)
      : PLACEHOLDER_IMG

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pokemon-box modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn modal-close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>

        <div className="modal-cover">
          <img src={cover} alt={detail.name} onError={imgFallback} />
          <div className="modal-cover-fade" />
          <h2 className="modal-title">{detail.name}</h2>
        </div>

        <div className="modal-body">
          {dates && <div className="modal-dates">🗓 {dates}</div>}
          {detail.notes && <p className="modal-notes">{detail.notes}</p>}

          <div className="modal-gallery-head">
            <span className="modal-section-label">Galería</span>
            <span className="modal-photo-count">
              {loading ? '…' : `${detail.photos.length} foto${detail.photos.length === 1 ? '' : 's'}`}
            </span>
          </div>

          {loading ? (
            <div className="modal-loading">
              <div className="pokeball-loader" />
            </div>
          ) : detail.photos.length === 0 ? (
            <p className="modal-empty">Todavía no hay fotos de este viaje.</p>
          ) : (
            <div className="modal-grid">
              {detail.photos.map((p) => (
                <button
                  key={p.id}
                  className="modal-thumb"
                  onClick={() => setLightbox(photoUrl(p.key))}
                  title={p.caption ?? undefined}
                >
                  <img src={photoUrl(p.key)} alt={p.caption ?? detail.name} onError={imgFallback} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" onError={imgFallback} />
        </div>
      )}
    </div>
  )
}
