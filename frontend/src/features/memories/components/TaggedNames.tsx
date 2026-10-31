import { Fragment } from 'react'
import type { User } from '../../../shared/types'

type Props = {
  ids: string[]
  users: Record<string, User>
  /** Each name opens that person's profile. (Profiles come later.) */
  onOpenProfile?: (userId: string) => void
  /** Show this many names, then "+N more". */
  max?: number
}

export default function TaggedNames({ ids, users, onOpenProfile, max = 2 }: Props) {
  if (!ids.length) return <span className="tagged-none">No one tagged</span>
  const shown = ids.slice(0, max)
  const rest = ids.length - shown.length
  return (
    <span className="tagged-names">
      Tagged:{' '}
      {shown.map((id, i) => (
        <Fragment key={id}>
          {i > 0 && ', '}
          <button type="button" className="tag-name" onClick={() => onOpenProfile?.(id)} title="View profile">
            {users[id]?.name ?? 'Someone'}
          </button>
        </Fragment>
      ))}
      {rest > 0 && (
        <span className="tag-more" title={ids.slice(max).map((id) => users[id]?.name ?? 'Someone').join(', ')}>
          {' '}
          +{rest} more
        </span>
      )}
    </span>
  )
}
