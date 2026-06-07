import { useMemo, useState } from 'react'
import type { Destination } from '../types'
import { CONTINENTS, continentOf, tripYear } from '../lib/geo'

export type YearFilter = number | 'none' | null

interface Props {
  destinations: Destination[]
  /** How many pins are currently visible (after filtering). */
  shownCount: number
  activeYear: YearFilter
  onYear: (y: YearFilter) => void
  activeContinents: string[]
  onToggleContinent: (id: string) => void
  onClear: () => void
}

/**
 * Timeline + continent filter. Continents are multi-select toggles; the year
 * timeline is single-select ("Todos" / a year / "Sin fecha"). Both combine with
 * AND. Collapsible so it stays out of the way.
 */
export default function TimelineFilter({
  destinations,
  shownCount,
  activeYear,
  onYear,
  activeContinents,
  onToggleContinent,
  onClear,
}: Props) {
  const [open, setOpen] = useState(false)

  const years = useMemo(() => {
    const counts = new Map<number, number>()
    let noDate = 0
    for (const d of destinations) {
      const y = tripYear(d)
      if (y === null) noDate++
      else counts.set(y, (counts.get(y) ?? 0) + 1)
    }
    const list = [...counts.entries()].sort((a, b) => a[0] - b[0])
    return { list, noDate }
  }, [destinations])

  const continents = useMemo(() => {
    const counts = new Map<string, number>()
    for (const d of destinations) {
      const id = continentOf(d.lat, d.lng)
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return CONTINENTS.filter((c) => counts.has(c.id)).map((c) => ({
      ...c,
      count: counts.get(c.id) as number,
    }))
  }, [destinations])

  if (destinations.length === 0) return null

  const total = destinations.length
  const activeCount = (activeYear !== null ? 1 : 0) + activeContinents.length
  const filtersActive = activeCount > 0

  return (
    <div className="hud-filter">
      <button
        className={`pokemon-box filter-toggle${filtersActive ? ' has-filters' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Filtrar destinos por año y continente"
      >
        <span className="filter-toggle-label">🧭 FILTROS</span>
        {filtersActive && <span className="filter-badge">{activeCount}</span>}
        <span className="filter-caret">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="pokemon-box filter-panel">
          <div className="filter-head">
            <span className="filter-shown">
              Mostrando <strong>{shownCount}</strong> de {total}
            </span>
            {filtersActive && (
              <button className="filter-clear" onClick={onClear}>
                Limpiar
              </button>
            )}
          </div>

          {continents.length > 0 && (
            <div className="filter-section">
              <span className="filter-section-label">Continente</span>
              <div className="filter-chips">
                {continents.map((c) => {
                  const on = activeContinents.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      className={`filter-chip${on ? ' active' : ''}`}
                      onClick={() => onToggleContinent(c.id)}
                    >
                      <span className="chip-emoji">{c.emoji}</span>
                      {c.label}
                      <span className="chip-count">{c.count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="filter-section">
            <span className="filter-section-label">Año</span>
            <div className="timeline">
              <button
                className={`timeline-year${activeYear === null ? ' active' : ''}`}
                onClick={() => onYear(null)}
              >
                Todos
              </button>
              {years.list.map(([year, count]) => (
                <button
                  key={year}
                  className={`timeline-year${activeYear === year ? ' active' : ''}`}
                  onClick={() => onYear(activeYear === year ? null : year)}
                >
                  <span className="timeline-dot" />
                  {year}
                  <span className="chip-count">{count}</span>
                </button>
              ))}
              {years.noDate > 0 && (
                <button
                  className={`timeline-year${activeYear === 'none' ? ' active' : ''}`}
                  onClick={() => onYear(activeYear === 'none' ? null : 'none')}
                >
                  Sin fecha
                  <span className="chip-count">{years.noDate}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
