import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Attachment, Message } from '../types'
import { clock, stamp } from '../../../shared/lib/time'
import { CheckIcon, CopyIcon, ForwardIcon, TrashIcon } from './icons'

type Props = {
  messages: Message[] | undefined
  meId: string
  otherName: string
  /** Scroll to and flash this message (from search or shared media). */
  highlightId?: string | null
  onForward: (message: Message) => void
  onDelete: (message: Message, forEveryone: boolean) => void
}

const GROUP_MS = 5 * 60_000 // consecutive messages from one person within this gap share a group
const BREAK_MS = 30 * 60_000 // a timestamp divider appears after a gap this long

const STATUS_LABEL: Record<Message['status'], string> = {
  sending: 'Sending…',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Seen',
  failed: 'Failed to send',
}

export default function MessageList({ messages, meId, otherName, highlightId, onForward, onDelete }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const count = messages?.length ?? 0
  const loaded = messages !== undefined
  const lastMine = messages ? [...messages].reverse().find((m) => m.senderId === meId) : undefined

  // stay pinned to the newest message unless the user has scrolled up to read history
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || highlightId) return
    const newestIsMine = messages?.[count - 1]?.senderId === meId
    if (nearBottom.current || newestIsMine) el.scrollTop = el.scrollHeight
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when a message is added
  }, [count])

  // ...and while images, videos and fonts finish loading and change the height
  // (but not while jumping to a highlighted message)
  const jumping = useRef(highlightId)
  useEffect(() => {
    jumping.current = highlightId
  }, [highlightId])
  useEffect(() => {
    const el = scroller.current, inner = content.current
    if (!el || !inner) return
    const ro = new ResizeObserver(() => {
      if (nearBottom.current && !jumping.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [loaded])

  useEffect(() => {
    if (!highlightId) return
    scroller.current?.querySelector(`[data-id="${CSS.escape(highlightId)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [highlightId])

  // hover actions: forward, copy, delete (on touch screens, tap a message to show them)
  const [tapped, setTapped] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  // the delete menu opens above its button, or below when there isn't room above in the conversation
  const [menuBelow, setMenuBelow] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(null), 1400)
    return () => clearTimeout(t)
  }, [copied])

  useEffect(() => {
    if (!confirming) return
    const away = (e: PointerEvent) => !(e.target as Element).closest?.('.msg-confirm') && setConfirming(null)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation() // closes just the menu, not the panel
      setConfirming(null)
    }
    document.addEventListener('pointerdown', away)
    window.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', esc, true)
    }
  }, [confirming])

  const copy = (m: Message) => {
    if (m.text) navigator.clipboard?.writeText(m.text).then(() => setCopied(m.id), () => {})
  }

  if (!messages) return <div className="messages" aria-busy="true" />

  return (
    <div
      className="messages"
      ref={scroller}
      role="log"
      aria-label={`Conversation with ${otherName}`}
      onScroll={(e) => {
        const el = e.currentTarget
        nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}
    >
      <div className="messages-inner" ref={content}>
        {messages.length === 0 && <p className="messages-empty">No messages yet. Say hi to {otherName} 👋</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1], next = messages[i + 1]
          const t = Date.parse(m.createdAt)
          const showStamp = !prev || t - Date.parse(prev.createdAt) > BREAK_MS
          const joinsPrev = !showStamp && prev?.senderId === m.senderId && t - Date.parse(prev.createdAt) < GROUP_MS
          const nextBreaks = !next || Date.parse(next.createdAt) - t > BREAK_MS
          const joinsNext = !nextBreaks && next?.senderId === m.senderId && Date.parse(next.createdAt) - t < GROUP_MS
          const pos = joinsPrev ? (joinsNext ? 'middle' : 'last') : joinsNext ? 'first' : 'single'
          const mine = m.senderId === meId
          return (
            <Fragment key={m.id}>
              {showStamp && <div className="msg-stamp">{stamp(m.createdAt)}</div>}
              <div
                className={`msg ${mine ? 'is-mine' : 'is-theirs'}${m.id === highlightId ? ' is-highlight' : ''}${m.status === 'sending' ? ' is-sending' : ''}${tapped === m.id || confirming === m.id ? ' is-active' : ''}`}
                data-id={m.id}
                data-pos={pos}
                title={clock(new Date(m.createdAt))}
                onClick={(e) => {
                  if (matchMedia('(hover: none)').matches && !(e.target as Element).closest('.msg-actions')) setTapped((t) => (t === m.id ? null : m.id))
                }}
              >
                {m.forwarded && (
                  <span className="msg-forwarded">
                    <ForwardIcon size={12} /> Forwarded
                  </span>
                )}
                {m.attachments.length > 0 && <Media items={m.attachments} />}
                {m.text && <p className="bubble">{m.text}</p>}
                {m.status !== 'sending' && m.status !== 'failed' && (
                  <div className="msg-actions">
                    <div className="msg-actions-bar" role="toolbar" aria-label="Message actions">
                      <button type="button" className="msg-action" aria-label="Forward" title="Forward" onClick={() => onForward(m)}>
                        <ForwardIcon />
                      </button>
                      {m.text && (
                        <button type="button" className="msg-action" aria-label={copied === m.id ? 'Copied' : 'Copy text'} title={copied === m.id ? 'Copied' : 'Copy'} onClick={() => copy(m)}>
                          {copied === m.id ? <CheckIcon /> : <CopyIcon />}
                        </button>
                      )}
                      <button type="button" className="msg-action" aria-label="Delete" title="Delete" aria-expanded={confirming === m.id} onClick={(e) => {
                          const room = e.currentTarget.getBoundingClientRect().top - (scroller.current?.getBoundingClientRect().top ?? 0)
                          setMenuBelow(room < (m.senderId === meId ? 170 : 130))
                          setConfirming((c) => (c === m.id ? null : m.id))
                        }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    {confirming === m.id && (
                      <div className={`msg-confirm${menuBelow ? ' is-below' : ''}`} role="menu" aria-label="Delete message">
                        {mine && (
                          <button type="button" role="menuitem" className="is-danger" onClick={() => (setConfirming(null), onDelete(m, true))}>
                            Unsend for everyone
                          </button>
                        )}
                        <button type="button" role="menuitem" className={mine ? undefined : 'is-danger'} onClick={() => (setConfirming(null), onDelete(m, false))}>
                          Delete for you
                        </button>
                        <button type="button" role="menuitem" onClick={() => setConfirming(null)}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {mine && m.id === lastMine?.id && <div className={`msg-status${m.status === 'failed' ? ' is-failed' : ''}`}>{STATUS_LABEL[m.status]}</div>}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function Media({ items }: { items: Attachment[] }) {
  return (
    <div className={`media${items.length > 1 ? ' is-grid' : ''}`}>
      {items.map((a) =>
        a.kind === 'video' ? (
          <video key={a.id} src={a.url} controls preload="metadata" playsInline aria-label={a.name} />
        ) : (
          <img key={a.id} src={a.url} alt={a.name} width={a.width} height={a.height} loading="lazy" />
        ),
      )}
    </div>
  )
}
