import type { ReactNode } from 'react'
import { longDate } from '../../../shared/lib/time'
import { kindLabel } from '../labels'
import type { Memory, User } from '../../../shared/types'
import TaggedNames from './TaggedNames'

type Props = {
  memory: Memory
  users: Record<string, User>
  selected: boolean
  onToggle: () => void
  /** Open the photo or album viewer. */
  onView: () => void
  /** Fly the globe to this place. */
  onLocate?: () => void
  /** Open the Edit screen (your own posts in Logged Captures). */
  onEdit?: () => void
  onOpenProfile?: (userId: string) => void
  /** Replaces the "Tagged" line (Recently Deleted shows the days left instead). */
  detail?: ReactNode
  highlight?: boolean
}

export default function CaptureRow({ memory: m, users, selected, onToggle, onView, onLocate, onEdit, onOpenProfile, detail, highlight }: Props) {
  const cover = m.items[0]
  const more = m.items.length - 1
  const renamed = m.title !== m.place.name
  return (
    <li
      className={`capture${onEdit ? ' has-edit' : ''}${selected ? ' is-selected' : ''}${highlight ? ' is-highlight' : ''}`}
      data-id={m.id}
      onClick={(e) => {
        // clicking the row's empty space shows the place; buttons and the checkbox do their own thing
        if (onLocate && !(e.target as HTMLElement).closest('button, input, label')) onLocate()
      }}
    >
      <button type="button" className="capture-thumb" onClick={onView} aria-label={`View ${m.title}${more ? `, ${m.items.length} photos` : ''}`}>
        {cover && <Thumb item={cover} />}
        {more > 0 && <span className="thumb-more">+{more}</span>}
      </button>
      <div className="capture-text">
        {onLocate ? (
          <button type="button" className="capture-title" onClick={onLocate} title="Show on the globe">
            {m.title}
            {renamed && <span className="capture-place"> · {m.place.name}</span>}
          </button>
        ) : (
          <span className="capture-title">
            {m.title}
            {renamed && <span className="capture-place"> · {m.place.name}</span>}
          </span>
        )}
        <span>
          {longDate(m.capturedAt)} · {kindLabel(m)}
        </span>
        {detail ?? <TaggedNames ids={m.taggedIds} users={users} onOpenProfile={onOpenProfile} />}
      </div>
      {onEdit && (
        <button type="button" className="capture-edit" onClick={onEdit} aria-label={`Edit ${m.title}`}>
          Edit
        </button>
      )}
      <input type="checkbox" className="check" checked={selected} onChange={onToggle} aria-label={`Select ${m.title}`} />
    </li>
  )
}

function Thumb({ item }: { item: Memory['items'][number] }) {
  if (item.kind === 'video') return <video src={item.url} muted preload="metadata" />
  return (
    <img
      src={item.url}
      alt=""
      loading="lazy"
      onError={(e) => e.currentTarget.classList.add('is-broken')} // e.g. HEIC outside Safari, until the server converts it
    />
  )
}
