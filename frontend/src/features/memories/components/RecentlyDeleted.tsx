import { useMemo, useState } from 'react'
import { RECENTLY_DELETED_DAYS } from '../../../app/config'
import { shortDate } from '../../../shared/lib/time'
import type { Memory, User } from '../../../shared/types'
import CaptureRow from './CaptureRow'
import { ChevronLeftIcon } from './icons'

type Props = {
  items: Memory[]
  users: Record<string, User>
  onView: (m: Memory) => void
  onRestore: (ids: string[]) => void
  onPurge: (ids: string[]) => void
  onBack: () => void
}

const DAY = 86_400_000
const daysLeft = (m: Memory) => Math.max(0, Math.ceil(RECENTLY_DELETED_DAYS - (Date.now() - Date.parse(m.deletedAt!)) / DAY))

export default function RecentlyDeleted({ items, users, onView, onRestore, onPurge, onBack }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  const live = useMemo(() => new Set(items.map((m) => m.id)), [items])
  const chosen = [...selected].filter((id) => live.has(id))
  const allChosen = items.length > 0 && chosen.length === items.length

  const done = () => {
    setSelected(new Set())
    setConfirming(false)
  }

  return (
    <div className="cap-view">
      <div className="cap-head is-sub">
        <button type="button" className="cap-icon-btn" onClick={onBack} aria-label="Back to Logged Captures" title="Back">
          <ChevronLeftIcon />
        </button>
        <h2>Recently Deleted</h2>
        {items.length > 0 && (
          <button type="button" className="cap-link" onClick={() => setSelected(allChosen ? new Set() : new Set(items.map((m) => m.id)))}>
            {allChosen ? 'Clear' : 'Select all'}
          </button>
        )}
      </div>
      <p className="cap-note">Deleted captures stay here for {RECENTLY_DELETED_DAYS} days, then they’re removed for good.</p>

      <div className="cap-scroll">
        {items.length === 0 ? (
          <p className="cap-empty">Nothing here.</p>
        ) : (
          <ul className="cap-list">
            {items.map((m) => {
              const left = daysLeft(m)
              return (
                <CaptureRow
                  key={m.id}
                  memory={m}
                  users={users}
                  selected={selected.has(m.id)}
                  onToggle={() =>
                    setSelected((s) => {
                      const n = new Set(s)
                      if (n.has(m.id)) n.delete(m.id)
                      else n.add(m.id)
                      return n
                    })
                  }
                  onView={() => onView(m)}
                  detail={
                    <span className={left <= 3 ? 'days-left is-soon' : 'days-left'}>
                      Deleted {shortDate(m.deletedAt!)} · {left === 0 ? 'removing today' : `${left} ${left === 1 ? 'day' : 'days'} left`}
                    </span>
                  }
                />
              )
            })}
          </ul>
        )}
      </div>

      {confirming ? (
        <div className="cap-foot is-confirm" role="alertdialog" aria-label="Delete forever">
          <p>
            Delete {chosen.length} {chosen.length === 1 ? 'capture' : 'captures'} forever? This can’t be undone.
          </p>
          <div>
            <button type="button" className="cap-btn" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="cap-btn is-danger is-solid"
              autoFocus
              onClick={() => {
                onPurge(chosen)
                done()
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        <div className="cap-foot">
          <button type="button" className="cap-btn is-danger" disabled={!chosen.length} onClick={() => setConfirming(true)}>
            Delete Forever
          </button>
          <button
            type="button"
            className="cap-btn"
            disabled={!chosen.length}
            onClick={() => {
              onRestore(chosen)
              done()
            }}
          >
            {chosen.length > 1 ? `Restore ${chosen.length}` : 'Restore'}
          </button>
        </div>
      )}
    </div>
  )
}
