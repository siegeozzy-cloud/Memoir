import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { chatBackground, chatColor } from '../themes'
import type { Message } from '../types'
import type { ChatApi } from '../useChat'
import type { Memory } from '../../../shared/types'
import Composer from './Composer'
import ConversationHeader, { type CallKind } from './ConversationHeader'
import ConversationInfo from './ConversationInfo'
import ForwardDialog from './ForwardDialog'
import MessageList from './MessageList'
import PeopleBar from './PeopleBar'
import { BackIcon } from './icons'
import './chat.css'

type Props = {
  open: boolean
  onClose: () => void
  chat: ChatApi
  memories: Memory[]
  onShowMemory: (memory: Memory) => void
  onCall?: (kind: CallKind) => void
  onAddFriend?: () => void
  /** Friend requests waiting for an answer; shown on the add-friend button. */
  requestCount?: number
  onRemoveFriend?: (userId: string) => void
}

// Slides in from the right edge over the globe. Stays mounted while closed so the open
// conversation, scroll position and draft survive closing and reopening.
export default function ChatPanel({ open, onClose, chat, memories, onShowMemory, onCall, onAddFriend, requestCount = 0, onRemoveFriend }: Props) {
  const { active, other } = chat
  const [view, setView] = useState<'messages' | 'info'>('messages')
  const [highlight, setHighlight] = useState<string | null>(null)
  const [shownId, setShownId] = useState(active?.id)
  const [forwarding, setForwarding] = useState<Message | null>(null)
  const friends = useMemo(() => chat.people.map((p) => p.user), [chat.people])

  // a different conversation always opens on its messages
  if (shownId !== active?.id) {
    setShownId(active?.id)
    setView('messages')
    setHighlight(null)
  }

  // reading along: anything that arrives while the conversation is open is already seen
  const count = chat.messages?.length ?? 0
  const activeId = active?.id
  const { markRead } = chat
  useEffect(() => {
    if (open && activeId && count) void markRead(activeId)
  }, [open, activeId, count, markRead])

  useEffect(() => {
    if (!highlight) return
    const t = setTimeout(() => setHighlight(null), 2200)
    return () => clearTimeout(t)
  }, [highlight])

  const jumpTo = (messageId: string) => {
    setView('messages')
    setHighlight(messageId)
  }

  const style = active ? ({ '--chat-color': chatColor(active.settings.color), '--chat-bg': chatBackground(active.settings.background) } as CSSProperties) : undefined

  return (
    <aside className={`chat${open ? ' is-open' : ''}`} aria-label="Messages" inert={!open}>
      <div className="chat-mobile-bar">
        <button type="button" className="icon-btn" aria-label="Close messages" onClick={onClose}>
          <BackIcon />
        </button>
        <span>Messages</span>
      </div>

      <PeopleBar chat={chat} onAddFriend={onAddFriend} requestCount={requestCount} />

      <div className="convo" style={style}>
        {active && other ? (
          <>
            <ConversationHeader
              user={other}
              nickname={active.settings.nickname}
              infoOpen={view === 'info'}
              onToggleInfo={() => setView((v) => (v === 'info' ? 'messages' : 'info'))}
              onCall={onCall}
            />
            {/* kept mounted while the info view is open, so the draft and scroll position survive */}
            <div className="convo-body" key={active.id} hidden={view === 'info'}>
              <MessageList
                messages={chat.messages}
                meId={chat.meId}
                otherName={active.settings.nickname || other.name}
                highlightId={highlight}
                onForward={setForwarding}
                onDelete={(m, forEveryone) => void chat.deleteMessage(m, forEveryone)}
              />
              <Composer placeholder={`Message ${active.settings.nickname || other.name}`} onSend={chat.send} />
            </div>
            {view === 'info' && (
              <ConversationInfo
                key={`info-${active.id}`}
                conversation={active}
                other={other}
                meId={chat.meId}
                messages={chat.messages}
                memories={memories}
                onChange={chat.updateSettings}
                onJumpTo={jumpTo}
                onShowMemory={onShowMemory}
                onDelete={() => chat.remove(active.id)}
                onRemoveFriend={onRemoveFriend && (() => onRemoveFriend(other.id))}
              />
            )}
          </>
        ) : (
          <div className="convo-empty">
            <p>Pick someone above, or search for a name to start a conversation.</p>
          </div>
        )}
      </div>

      {forwarding && <ForwardDialog message={forwarding} friends={friends} onSend={(to) => chat.forward(forwarding, to)} onClose={() => setForwarding(null)} />}
    </aside>
  )
}
