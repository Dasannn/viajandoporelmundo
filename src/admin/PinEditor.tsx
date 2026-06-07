import { useEffect, useRef, useState } from 'react'
import type { DestinationDetail, DestinationInput } from '../types'
import {
  PLACEHOLDER_IMG,
  createDestination,
  deletePhoto,
  deleteDestination,
  fetchDestination,
  photoUrl,
  updateDestination,
  uploadPhotos,
} from '../api'

/** A pin being created (no id yet) or edited (with id). */
export interface PinDraft extends DestinationInput {
  id?: string
}

interface Props {
  draft: PinDraft
  /** Called after any successful change, so the globe can refresh its pins. */
  onChange: () => void
  onClose: () => void
}

function imgFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const el = e.currentTarget
  if (el.src.endsWith('placeholder.png')) return
  el.src = PLACEHOLDER_IMG
}

/**
 * Admin-only editor to create or edit a destination pin and manage its photo
 * gallery. Metadata is saved first (a new pin must exist before photos can be
 * attached); the photo section unlocks once the destination has an id.
 */
export default function PinEditor({ draft, onChange, onClose }: Props) {
  const [id, setId] = useState<string | null>(draft.id ?? null)
  const [name, setName] = useState(draft.name)
  const [from, setFrom] = useState(draft.visitedFrom ?? '')
  const [to, setTo] = useState(draft.visitedTo ?? '')
  const [notes, setNotes] = useState(draft.notes ?? '')
  const [coverKey, setCoverKey] = useState<string | null>(draft.coverKey)
  const [detail, setDetail] = useState<DestinationDetail | null>(null)

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Load existing photos when editing an existing pin.
  useEffect(() => {
    if (!draft.id) return
    let cancelled = false
    fetchDestination(draft.id)
      .then((d) => {
        if (!cancelled) {
          setDetail(d)
          setCoverKey(d.coverKey)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [draft.id])

  const input = (): DestinationInput => ({
    name: name.trim(),
    lat: draft.lat,
    lng: draft.lng,
    coverKey,
    visitedFrom: from || null,
    visitedTo: to || null,
    notes: notes.trim() || null,
  })

  const saveMeta = async () => {
    if (!name.trim()) {
      setError('Ponle un nombre al destino.')
      return
    }
    setError('')
    setSaving(true)
    try {
      if (id) {
        await updateDestination(id, input())
      } else {
        const created = await createDestination(input())
        setId(created.id)
        setDetail({ ...created, photos: [] })
      }
      onChange()
    } catch {
      setError('No se pudo guardar. ¿Sigues con sesión de administrador?')
    } finally {
      setSaving(false)
    }
  }

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (fileRef.current) fileRef.current.value = '' // allow re-selecting the same file
    if (!id || files.length === 0) return
    setError('')
    setUploading(true)
    try {
      const updated = await uploadPhotos(id, files)
      setDetail(updated)
      setCoverKey(updated.coverKey)
      onChange()
    } catch {
      setError('No se pudieron subir las fotos (tamaño máx. 15 MB, solo imágenes).')
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = async (photoId: string) => {
    if (!id) return
    setError('')
    try {
      const updated = await deletePhoto(id, photoId)
      setDetail(updated)
      setCoverKey(updated.coverKey)
      onChange()
    } catch {
      setError('No se pudo eliminar la foto.')
    }
  }

  const makeCover = async (key: string) => {
    if (!id) return
    setError('')
    setCoverKey(key)
    try {
      await updateDestination(id, { ...input(), coverKey: key })
      onChange()
    } catch {
      setError('No se pudo fijar la portada.')
    }
  }

  const removeDestination = async () => {
    if (!id) {
      onClose()
      return
    }
    if (!window.confirm(`¿Eliminar "${name}" y todas sus fotos? No se puede deshacer.`)) return
    try {
      await deleteDestination(id)
      onChange()
      onClose()
    } catch {
      setError('No se pudo eliminar el destino.')
    }
  }

  const photos = detail?.photos ?? []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pokemon-box modal-card pin-editor" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn modal-close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>

        <div className="modal-body">
          <h2 className="editor-title">{id ? 'Editar destino' : 'Nuevo destino'}</h2>
          <p className="editor-coords">
            📍 {draft.lat.toFixed(2)}°, {draft.lng.toFixed(2)}°
          </p>

          <label className="editor-label">
            Nombre
            <input
              className="pokemon-input"
              type="text"
              value={name}
              placeholder="p. ej. Kioto, Japón"
              onChange={(e) => setName(e.target.value)}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </label>

          <div className="editor-dates">
            <label className="editor-label">
              Desde
              <input
                className="pokemon-input"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="editor-label">
              Hasta
              <input
                className="pokemon-input"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>

          <label className="editor-label">
            Notas
            <textarea
              className="pokemon-input editor-notes"
              value={notes}
              placeholder="Un recuerdo de este viaje…"
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </label>

          <button className="auth-btn editor-save" onClick={saveMeta} disabled={saving}>
            {saving ? 'Guardando…' : id ? 'Guardar cambios' : 'Crear destino'}
          </button>

          {/* Photo gallery management — unlocked once the destination exists. */}
          <div className="editor-photos">
            <div className="modal-gallery-head">
              <span className="modal-section-label">Fotos</span>
              <span className="modal-photo-count">{photos.length}</span>
            </div>

            {!id ? (
              <p className="editor-hint">Guarda el destino para poder añadir fotos.</p>
            ) : (
              <>
                <input
                  ref={fileRef}
                  className="editor-file"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  multiple
                  onChange={onPickFiles}
                  disabled={uploading}
                />
                {uploading && <p className="editor-hint">Subiendo fotos…</p>}

                {photos.length > 0 && (
                  <div className="modal-grid editor-grid">
                    {photos.map((p) => {
                      const isCover = p.key === coverKey
                      return (
                        <div key={p.id} className={`editor-thumb${isCover ? ' is-cover' : ''}`}>
                          <img src={photoUrl(p.key)} alt={p.caption ?? name} onError={imgFallback} />
                          <div className="editor-thumb-actions">
                            <button
                              className="thumb-action"
                              title={isCover ? 'Portada actual' : 'Usar como portada'}
                              onClick={() => makeCover(p.key)}
                            >
                              {isCover ? '★' : '☆'}
                            </button>
                            <button
                              className="thumb-action thumb-del"
                              title="Eliminar foto"
                              onClick={() => removePhoto(p.id)}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button className="editor-delete" onClick={removeDestination}>
            {id ? '🗑 Eliminar destino' : 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  )
}
