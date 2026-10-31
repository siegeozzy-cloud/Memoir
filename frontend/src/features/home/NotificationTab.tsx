import { useEffect, useState } from 'react'
import type { AppNotification } from '../../shared/types'
import Avatar from '../../shared/components/Avatar'

type Props = {
  item: AppNotification | undefined
  durationMs: number
  /** Called once the current notification has slid away, so the next one can show. */
  onDone: () => void
  onOpen?: (item: AppNotification) => void
}

// Tab hanging from the top edge. It slides down, the line under the text runs down over
// `durationMs`, then the tab slides back up.
export default function NotificationTab({ item, durationMs, onDone, onOpen }: Props) {
  return (
    <div className="notif-host" aria-live="polite">
      {item && <Tab key={item.id} item={item} durationMs={durationMs} onDone={onDone} onOpen={onOpen} />}
    </div>
  )
}

function Tab({ item, durationMs, onDone, onOpen }: Props & { item: AppNotification }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setLeaving(true), durationMs)
    return () => clearTimeout(t)
  }, [durationMs])

  return (
    <div
      className={`notif${leaving ? ' is-leaving' : ''}`}
      onAnimationEnd={(e) => {
        if (leaving && e.target === e.currentTarget) onDone()
      }}
    >
      <button
        type="button"
        className="notif-body"
        onClick={() => {
          onOpen?.(item)
          setLeaving(true)
        }}
      >
        <Avatar user={item.from} size={44} />
        <span className="notif-text">
          <strong>{item.from.name}</strong>: {item.message}
        </span>
      </button>
      <span className="notif-bar" style={{ animationDuration: `${durationMs}ms` }} aria-hidden="true" />
    </div>
  )
}
