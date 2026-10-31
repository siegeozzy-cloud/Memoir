import { useEffect, useMemo, useRef, useState } from 'react'
import { flagEmoji } from '../../../shared/lib/countries'
import type { Memory, User } from '../../../shared/types'
import CaptureRow from './CaptureRow'
import { ChevronDownIcon, SearchIcon, TrashIcon } from './icons'

type Props = {
  captures: Memory[]
  deletedCount: number
  users: Record<string, User>
  /** Scroll to and flash this capture (a new post). */
  highlightId?: string | null
  onView: (m: Memory) => void
  onLocate: (m: Memory) => void
  onEdit: (m: Memory) => void
  onOpenProfile?: (userId: string) => void
  onDelete: (ids: string[]) => void
  onOpenTrash: () => void
  onNewPost: () => void
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

type Section = { key: string; country: string; code?: string; items: Memory[] }

/** One section per country, the country with your latest capture first; newest captures first inside. */
function sections(list: Memory[]): Section[] {
  const map = new Map<string, Section>()
  for (const m of list) {
    const key = m.place.countryCode ?? m.place.country
    let s = map.get(key)
    if (!s) map.set(key, (s = { key, country: m.place.country, code: m.place.countryCode, items: [] }))
    s.items.push(m)
  }
  const latest = (s: Section) => s.items.reduce((t, m) => (m.capturedAt > t ? m.capturedAt : t), '')
  return [...map.values()].sort((a, b) => latest(b).localeCompare(latest(a)))
}

export default function LoggedCaptures({ captures, deletedCount, users, highlightId, onView, onLocate, onEdit, onOpenProfile, onDelete, onOpenTrash, onNewPost }: Props) {
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const list = useRef<HTMLDivElement>(null)

  // search by place, country, album name or the people tagged
  const q = norm(query.trim())
  const filtered = useMemo(
    () =>
      q
        ? captures.filter((m) =>
            norm([m.title, m.place.name, m.place.country, ...m.taggedIds.map((id) => users[id]?.name ?? '')].join(' ')).includes(q),
          )
        : captures,
    [captures, users, q],
  )
  const groups = useMemo(() => sections(filtered), [filtered])

  // forget selections for captures that are gone (deleted elsewhere)
  const live = useMemo(() => new Set(captures.map((m) => m.id)), [captures])
  const chosen = [...selected].filter((id) => live.has(id))

  useEffect(() => {
    if (!highlightId) return
    list.current?.querySelector(`[data-id="${CSS.escape(highlightId)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [highlightId, captures])

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }

  return (
    <div className="cap-view">
      <div className="cap-search">
        <input
          type="search"
          value={query}
          placeholder="Search Location"
          aria-label="Search by location or tagged person"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              setQuery('')
              e.stopPropagation()
            }
          }}
        />
        <SearchIcon />
      </div>

      <div className="cap-head">
        <h2>Logged Captures</h2>
        <button
          type="button"
          className="cap-icon-btn"
          onClick={onOpenTrash}
          aria-label={`Recently Deleted${deletedCount ? `, ${deletedCount} items` : ''}`}
          title="Recently Deleted"
        >
          <TrashIcon />
          {deletedCount > 0 && <span className="trash-count">{deletedCount}</span>}
        </button>
      </div>

      <div className="cap-scroll" ref={list}>
        {captures.length === 0 ? (
          <p className="cap-empty">No captures yet. Use New Post to pin your first memory on the globe.</p>
        ) : groups.length === 0 ? (
          <p className="cap-empty">No captures match “{query.trim()}”.</p>
        ) : (
          groups.map((s) => {
            const open = q.length > 0 || !collapsed.has(s.key) // searching always shows matches
            return (
              <section key={s.key} className="cap-section">
                <button
                  type="button"
                  className="cap-section-head"
                  aria-expanded={open}
                  onClick={() => setCollapsed((c) => toggle(c, s.key))}
                >
                  <span className="chev">
                    <ChevronDownIcon />
                  </span>
                  <span>{s.country}</span>
                  {s.code && (
                    <span className="flag" aria-hidden="true">
                      {flagEmoji(s.code)}
                    </span>
                  )}
                  {!open && <span className="cap-section-count">{s.items.length}</span>}
                </button>
                {open && (
                  <ul className="cap-list">
                    {s.items.map((m) => (
                      <CaptureRow
                        key={m.id}
                        memory={m}
                        users={users}
                        selected={selected.has(m.id)}
                        onToggle={() => setSelected((sel) => toggle(sel, m.id))}
                        onView={() => onView(m)}
                        onLocate={() => onLocate(m)}
                        onEdit={() => onEdit(m)}
                        onOpenProfile={onOpenProfile}
                        highlight={m.id === highlightId}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )
          })
        )}
      </div>

      <div className="cap-foot">
        <button
          type="button"
          className="cap-btn is-danger"
          disabled={chosen.length === 0}
          onClick={() => {
            onDelete(chosen)
            setSelected(new Set())
          }}
          title={chosen.length ? 'Move to Recently Deleted' : 'Tick the captures to delete'}
        >
          {chosen.length > 1 ? `Delete ${chosen.length}` : 'Delete'}
        </button>
        <button type="button" className="cap-btn" onClick={onNewPost}>
          New Post
        </button>
      </div>
    </div>
  )
}
