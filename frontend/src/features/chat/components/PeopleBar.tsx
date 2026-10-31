import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ChatApi } from '../useChat'
import { PRESENCE } from '../../../shared/lib/presence'
import type { User } from '../../../shared/types'
import Avatar from '../../../shared/components/Avatar'
import { AddPersonIcon, ChevronIcon, SearchIcon } from './icons'

type Props = { chat: ChatApi; onAddFriend?: () => void }

export default function PeopleBar({ chat, onAddFriend }: Props) {
  return (
    <section className="people-bar" aria-label="People">
      <div className="people-top">
        <PeopleSearch chat={chat} />
        <button type="button" className="icon-btn" aria-label="Add a friend" title="Add a friend" onClick={onAddFriend}>
          <AddPersonIcon />
        </button>
      </div>
      <PeopleCarousel chat={chat} />
    </section>
  )
}

/** "Start a Conversation": find anyone by name and open (or start) a chat with them. */
function PeopleSearch({ chat }: { chat: ChatApi }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<User[]>([])
  const [sel, setSel] = useState(0)
  const listId = useId()
  const { search, openWith } = chat
  const open = query.trim().length > 0

  useEffect(() => {
    if (!query.trim()) return
    let cancelled = false
    const t = setTimeout(() => {
      search(query).then((r) => {
        if (cancelled) return
        setResults(r)
        setSel(0)
      })
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [query, search])

  const pick = (u: User | undefined) => {
    if (!u) return
    openWith(u)
    setQuery('')
    setResults([])
  }

  return (
    <div className="people-search">
      <SearchIcon />
      <input
        type="search"
        placeholder="Start a Conversation"
        aria-label="Find someone to message"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && results[sel] ? `${listId}-${sel}` : undefined}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && results.length) setSel((s) => (s + 1) % results.length)
          else if (e.key === 'ArrowUp' && results.length) setSel((s) => (s - 1 + results.length) % results.length)
          else if (e.key === 'Enter') pick(results[sel])
          else if (e.key === 'Escape' && query) setQuery('')
          else return
          e.preventDefault()
          e.stopPropagation()
        }}
      />
      {open && (
        <ul className="search-results" id={listId} role="listbox">
          {results.length === 0 && <li className="search-empty">No one found</li>}
          {results.map((u, i) => (
            <li
              key={u.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === sel}
              onPointerDown={(e) => {
                e.preventDefault()
                pick(u)
              }}
              onPointerEnter={() => setSel(i)}
            >
              <Avatar user={u} size={34} radius={8} />
              <span className="search-name">{u.name}</span>
              <span className="search-meta">{chat.people.some((p) => p.user.id === u.id) ? PRESENCE[u.status].label : 'Not a friend yet'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PeopleCarousel({ chat }: { chat: ChatApi }) {
  const strip = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ prev: false, next: false })

  const measure = () => {
    const el = strip.current
    if (!el) return
    setEdges({ prev: el.scrollLeft > 4, next: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
  }
  useLayoutEffect(() => {
    measure()
    const el = strip.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [chat.people.length])

  // one page at a time, landing on whole avatars thanks to scroll-snap
  const page = (dir: 1 | -1) => strip.current?.scrollBy({ left: dir * strip.current.clientWidth * 0.85, behavior: 'smooth' })

  return (
    <div className="people-carousel">
      <div className="people-strip" ref={strip} onScroll={measure}>
        {chat.people.map(({ user, conversation }) => {
          const unread = conversation?.unread ?? 0
          const active = !!conversation && conversation.id === chat.active?.id
          const presence = PRESENCE[user.status]
          return (
            <button
              key={user.id}
              type="button"
              className={`person${active ? ' is-active' : ''}`}
              aria-label={`${user.name}, ${presence.label}${unread ? `, ${unread} unread` : ''}`}
              aria-current={active || undefined}
              title={user.name}
              onClick={() => chat.openWith(user)}
            >
              <Avatar user={user} size={66} radius={12} />
              {user.status !== 'offline' && <span className="status-dot" style={{ background: presence.color }} />}
              {unread > 0 && <span className="unread-badge">{unread > 99 ? '99+' : unread}</span>}
            </button>
          )
        })}
      </div>
      {edges.prev && (
        <button type="button" className="strip-nav is-prev" aria-label="Previous people" onClick={() => page(-1)}>
          <ChevronIcon dir="left" />
        </button>
      )}
      {edges.next && (
        <button type="button" className="strip-nav is-next" aria-label="More people" onClick={() => page(1)}>
          <ChevronIcon />
        </button>
      )}
    </div>
  )
}
