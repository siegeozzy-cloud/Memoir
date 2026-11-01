import { useMemo, useState } from 'react'
import { CHAT_BACKGROUNDS, CHAT_COLORS } from '../themes'
import type { Conversation, ConversationSettings, Message } from '../types'
import { stamp } from '../../../shared/lib/time'
import type { Memory, User } from '../../../shared/types'
import { PinIcon, PlayIcon, SearchIcon } from './icons'

type Props = {
  conversation: Conversation
  other: User
  meId: string
  messages: Message[] | undefined
  memories: Memory[]
  onChange: (patch: Partial<ConversationSettings>) => void
  /** Go back to the conversation, scrolled to this message. */
  onJumpTo: (messageId: string) => void
  onShowMemory: (memory: Memory) => void
  onDelete: () => void
  /** Stop being friends. The conversation stays; they leave your people bar. */
  onRemoveFriend?: () => void
}

// Messenger-style "chat info": customise, search, shared media, tagged posts, delete.
export default function ConversationInfo({ conversation, other, meId, messages = [], memories, onChange, onJumpTo, onShowMemory, onDelete, onRemoveFriend }: Props) {
  const { settings } = conversation
  const media = useMemo(
    () => messages.flatMap((m) => m.attachments.map((a) => ({ a, messageId: m.id }))).reverse(),
    [messages],
  )
  const tagged = useMemo(() => {
    const involves = (m: Memory, id: string) => m.ownerId === id || m.taggedIds.includes(id)
    return memories.filter((m) => !m.deletedAt && involves(m, meId) && involves(m, other.id))
  }, [memories, meId, other.id])

  return (
    <div className="info">
      <section className="info-section">
        <h3>Customize</h3>
        <div className="info-card">
          <NicknameRow key={conversation.id} value={settings.nickname ?? ''} placeholder={other.name} onSave={(nickname) => onChange({ nickname: nickname || undefined })} />
          <div className="info-row is-stacked">
            <span id="chat-color-label">Chat color</span>
            <div className="swatches" role="radiogroup" aria-labelledby="chat-color-label">
              {Object.entries(CHAT_COLORS).map(([key, c]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={settings.color === key}
                  aria-label={c.label}
                  title={c.label}
                  className="swatch"
                  style={{ background: c.value }}
                  onClick={() => onChange({ color: key })}
                />
              ))}
            </div>
          </div>
          <div className="info-row is-stacked">
            <span id="chat-bg-label">Chat background</span>
            <div className="backgrounds" role="radiogroup" aria-labelledby="chat-bg-label">
              {Object.entries(CHAT_BACKGROUNDS).map(([key, b]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={settings.background === key}
                  aria-label={b.label}
                  title={b.label}
                  className="bg-tile"
                  style={{ background: b.value }}
                  onClick={() => onChange({ background: key })}
                >
                  <i className="mini is-theirs" />
                  <i className="mini is-mine" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <SearchSection messages={messages} other={other} meId={meId} onJumpTo={onJumpTo} />

      <section className="info-section">
        <h3>
          Shared Contents <span className="count">{media.length}</span>
        </h3>
        {media.length === 0 ? (
          <p className="info-empty">Photos and videos you send each other show up here.</p>
        ) : (
          <div className="media-grid">
            {media.map(({ a, messageId }) => (
              <button key={a.id} type="button" className="media-cell" aria-label={`Show ${a.name} in the conversation`} onClick={() => onJumpTo(messageId)}>
                {a.kind === 'video' ? (
                  <>
                    <video src={a.url} muted preload="metadata" />
                    <span className="media-play">
                      <PlayIcon size={24} />
                    </span>
                  </>
                ) : (
                  <img src={a.url} alt="" loading="lazy" />
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="info-section">
        <h3>
          Tagged Posts <span className="count">{tagged.length}</span>
        </h3>
        {tagged.length === 0 ? (
          <p className="info-empty">Memories you are both tagged in show up here.</p>
        ) : (
          <div className="tagged-list">
            {tagged.map((m) => (
              <button key={m.id} type="button" className="tagged" onClick={() => onShowMemory(m)} aria-label={`${m.title}, ${m.place.name}. Open`}>
                {m.items[0] && <img src={m.items[0].url} alt="" />}
                <span className="tagged-text">
                  <strong>{m.title}</strong>
                  <span>
                    <PinIcon /> {m.place.name}, {m.place.country}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <DeleteSection name={settings.nickname || other.name} onDelete={onDelete} onRemoveFriend={onRemoveFriend} />
    </div>
  )
}

function NicknameRow({ value, placeholder, onSave }: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  const commit = () => {
    if (draft.trim() !== value) onSave(draft.trim())
  }
  return (
    <label className="info-row">
      <span>Nickname</span>
      <input
        className="info-input"
        value={draft}
        placeholder={placeholder}
        maxLength={32}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(value)
            e.stopPropagation()
          }
        }}
      />
    </label>
  )
}

function SearchSection({ messages, other, meId, onJumpTo }: { messages: Message[]; other: User; meId: string; onJumpTo: (id: string) => void }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const hits = useMemo(
    () => (needle ? messages.filter((m) => m.text?.toLowerCase().includes(needle)).reverse().slice(0, 30) : []),
    [messages, needle],
  )
  return (
    <section className="info-section">
      <h3>Search Conversation</h3>
      <div className="info-search">
        <SearchIcon size={18} />
        <input
          type="search"
          value={q}
          placeholder="Find a message"
          aria-label="Search this conversation"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && q) {
              setQ('')
              e.stopPropagation()
            }
          }}
        />
      </div>
      {needle && (
        <ul className="search-hits">
          {hits.length === 0 && <li className="info-empty">No messages match “{q.trim()}”.</li>}
          {hits.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => onJumpTo(m.id)}>
                <span className="hit-meta">
                  {m.senderId === meId ? 'You' : other.name} · {stamp(m.createdAt)}
                </span>
                <span className="hit-text">
                  <Highlight text={m.text ?? ''} needle={needle} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Highlight({ text, needle }: { text: string; needle: string }) {
  const i = text.toLowerCase().indexOf(needle)
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + needle.length)}</mark>
      {text.slice(i + needle.length)}
    </>
  )
}

function DeleteSection({ name, onDelete, onRemoveFriend }: { name: string; onDelete: () => void; onRemoveFriend?: () => void }) {
  const [confirming, setConfirming] = useState<'delete' | 'unfriend' | null>(null)
  const unfriending = confirming === 'unfriend'
  return (
    <section className="info-section">
      {confirming ? (
        <div className="info-card delete-confirm" role="alertdialog" aria-label={unfriending ? 'Remove friend' : 'Delete conversation'}>
          <p>
            {unfriending
              ? `Remove ${name} from your friends? They leave your people bar, and neither of you can start a new conversation or call until you're friends again. Your messages stay.`
              : `Delete your conversation with ${name}? This removes all messages and shared contents for you.`}
          </p>
          <div className="delete-actions">
            <button type="button" className="btn" onClick={() => setConfirming(null)}>
              Cancel
            </button>
            <button type="button" className="btn is-danger" onClick={unfriending ? onRemoveFriend : onDelete} autoFocus>
              {unfriending ? 'Remove' : 'Delete'}
            </button>
          </div>
        </div>
      ) : (
        <div className="info-actions">
          {onRemoveFriend && (
            <button type="button" className="delete-link is-quiet" onClick={() => setConfirming('unfriend')}>
              Remove Friend
            </button>
          )}
          <button type="button" className="delete-link" onClick={() => setConfirming('delete')}>
            Delete Conversation
          </button>
        </div>
      )}
    </section>
  )
}
