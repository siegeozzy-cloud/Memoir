import { useEffect, useMemo, useState } from 'react'
import type { Message } from '../types'
import type { User } from '../../../shared/types'
import Avatar from '../../../shared/components/Avatar'
import { CloseIcon, SearchIcon } from './icons'

type Props = {
  message: Message
  friends: User[]
  onSend: (to: User) => Promise<void>
  onClose: () => void
}

type SendState = 'sending' | 'sent' | 'failed'

// Pick friends to send a copy of a message to; each Send goes at once, like Messenger.
export default function ForwardDialog({ message, friends, onSend, onClose }: Props) {
  const [q, setQ] = useState('')
  const [state, setState] = useState<Record<string, SendState>>({})
  const needle = q.trim().toLowerCase()
  const shown = useMemo(() => friends.filter((f) => f.name.toLowerCase().includes(needle)), [friends, needle])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation() // closes just this dialog, not the chat panel
      onClose()
    }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [onClose])

  const send = async (to: User) => {
    setState((s) => ({ ...s, [to.id]: 'sending' }))
    try {
      await onSend(to)
      setState((s) => ({ ...s, [to.id]: 'sent' }))
    } catch {
      setState((s) => ({ ...s, [to.id]: 'failed' }))
    }
  }

  const first = message.attachments[0]

  return (
    <div className="fwd-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fwd" role="dialog" aria-modal="true" aria-labelledby="fwd-title">
        <header className="fwd-head">
          <h2 id="fwd-title">Forward</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="fwd-preview">
          {first &&
            (first.kind === 'video' ? <video src={first.url} muted preload="metadata" /> : <img src={first.url} alt="" />)}
          <p>{message.text || (message.attachments.length > 1 ? `${message.attachments.length} photos and videos` : first?.kind === 'video' ? 'Video' : 'Photo')}</p>
        </div>

        <div className="info-search">
          <SearchIcon size={18} />
          <input type="search" value={q} placeholder="Search friends" aria-label="Search friends" autoFocus onChange={(e) => setQ(e.target.value)} />
        </div>

        <ul className="fwd-list">
          {shown.length === 0 && <li className="info-empty">No friends match “{q.trim()}”.</li>}
          {shown.map((f) => {
            const s = state[f.id]
            return (
              <li key={f.id}>
                <Avatar user={f} size={36} radius={10} />
                <span className="fwd-name">{f.name}</span>
                <button type="button" className={`fwd-send${s === 'sent' ? ' is-sent' : ''}`} disabled={s === 'sending' || s === 'sent'} onClick={() => send(f)}>
                  {s === 'sent' ? 'Sent' : s === 'sending' ? 'Sending…' : s === 'failed' ? 'Retry' : 'Send'}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="fwd-foot">
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
