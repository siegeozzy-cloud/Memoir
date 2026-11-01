import { useEffect, useState } from 'react'
import Avatar from '../../../shared/components/Avatar'
import { ApiError } from '../../../shared/lib/api'
import { PRESENCE } from '../../../shared/lib/presence'
import type { User } from '../../../shared/types'
import { CheckIcon, CloseIcon, SearchIcon } from '../../chat/components/icons'
import { CopyIcon } from '../../account/components/icons'
import { friendsApi, type FriendRequest, type Relation, type SearchResult } from '../service'
import type { FriendsApi } from '../useFriends'
import './friends.css'

type Props = {
  /** Yours, to share with people who want to add you. */
  myUniqueId?: string
  requests: FriendsApi
  /** The people you're already friends with; they can be removed here too. */
  people: User[]
  onClose: () => void
}

// Find someone by name or by their unique ID, then ask to be friends. They decide.
export default function AddFriendDialog({ myUniqueId, requests, people, onClose }: Props) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<Record<string, Relation>>({})

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation() // closes this dialog, not the chat panel
      onClose()
    }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [onClose])

  const term = q.trim()
  const shown = term.length >= 2 ? results : []

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    const t = setTimeout(() => {
      setSearching(true)
      friendsApi
        .search(term)
        .then((r) => {
          setResults(r)
          setError('')
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t search just now.'))
        .finally(() => setSearching(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const act = async (run: () => Promise<unknown>, userId?: string, becomes?: Relation) => {
    setError('')
    try {
      await run()
      if (userId && becomes) setDone((d) => ({ ...d, [userId]: becomes }))
      await requests.reload()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That didn’t work. Try again.')
    }
  }

  return (
    <div className="fwd-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fwd fr" role="dialog" aria-modal="true" aria-labelledby="add-friend-title">
        <header className="fwd-head">
          <h2 id="add-friend-title">Add a friend</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        {myUniqueId && <MyId id={myUniqueId} />}

        <div className="info-search">
          <SearchIcon size={18} />
          <input
            type="search"
            value={q}
            placeholder="Name or ID (MMR-XXXX-XXXX)"
            aria-label="Find someone by name or unique ID"
            autoFocus
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {error && (
          <p className="fr-error" role="alert">
            {error}
          </p>
        )}

        <div className="fr-scroll">
          {term.length >= 2 && (
            <section>
              <h3>Results</h3>
              {shown.length === 0 && !searching && <p className="info-empty">Nobody matches “{term}”. Check the spelling, or ask them for their ID.</p>}
              <ul className="fr-list">
                {shown.map(({ user, uniqueId, relation }) => {
                  const state = done[user.id] ?? relation
                  return (
                    <li key={user.id}>
                      <Avatar user={user} size={36} radius={10} />
                      <span className="fr-who">
                        <strong>{user.name}</strong>
                        {uniqueId && <small>{uniqueId}</small>}
                      </span>
                      {state === 'friend' ? (
                        <span className="fr-state">
                          <CheckIcon size={15} /> Friends
                        </span>
                      ) : state === 'sent' ? (
                        <span className="fr-state">Asked</span>
                      ) : (
                        <button type="button" className="fwd-send" onClick={() => act(() => friendsApi.add(user.id), user.id, state === 'received' ? 'friend' : 'sent')}>
                          {state === 'received' ? 'Accept' : 'Add'}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          <Requests
            title="Waiting for you"
            list={requests.incoming}
            actions={(r) => (
              <>
                <button type="button" className="fwd-send" onClick={() => act(() => friendsApi.accept(r.id))}>
                  Accept
                </button>
                <button type="button" className="fr-quiet" onClick={() => act(() => friendsApi.dismiss(r.id))}>
                  Decline
                </button>
              </>
            )}
          />
          <Requests
            title="You asked"
            list={requests.outgoing}
            actions={(r) => (
              <button type="button" className="fr-quiet" onClick={() => act(() => friendsApi.dismiss(r.id))}>
                Cancel
              </button>
            )}
          />

          {people.length > 0 && (
            <section>
              <h3>
                Your friends <span className="count">{people.length}</span>
              </h3>
              <ul className="fr-list">
                {people.map((friend) => (
                  <li key={friend.id}>
                    <Avatar user={friend} size={36} radius={10} />
                    <span className="fr-who">
                      <strong>{friend.name}</strong>
                      <small>{PRESENCE[friend.status].label}</small>
                    </span>
                    <RemoveFriend name={friend.name} onRemove={() => act(() => friendsApi.unfriend(friend.id))} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="fwd-foot">
          <button type="button" className="btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

function Requests({ title, list, actions }: { title: string; list: FriendRequest[]; actions: (r: FriendRequest) => React.ReactNode }) {
  if (!list.length) return null
  return (
    <section>
      <h3>
        {title} <span className="count">{list.length}</span>
      </h3>
      <ul className="fr-list">
        {list.map((r) => (
          <li key={r.id}>
            <Avatar user={r.user} size={36} radius={10} />
            <span className="fr-who">
              <strong>{r.user.name}</strong>
            </span>
            {actions(r)}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Removing a friend asks once, in place. */
function RemoveFriend({ name, onRemove }: { name: string; onRemove: () => Promise<void> }) {
  const [asking, setAsking] = useState(false)
  if (!asking)
    return (
      <button type="button" className="fr-quiet" aria-label={`Remove ${name} from your friends`} onClick={() => setAsking(true)}>
        Remove
      </button>
    )
  return (
    <>
      <button type="button" className="fr-quiet is-red" onClick={() => void onRemove()}>
        Remove {name.split(' ')[0]}?
      </button>
      <button type="button" className="fr-quiet" onClick={() => setAsking(false)}>
        Keep
      </button>
    </>
  )
}

/** Your own ID, to pass on to someone who wants to add you. */
function MyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <div className="pf-id">
      <span className="pf-id-label">Your ID</span>
      <code>{id}</code>
      <button type="button" className="pf-copy" aria-label={copied ? 'Copied' : 'Copy your unique ID'} onClick={() => navigator.clipboard?.writeText(id).then(() => setCopied(true), () => {})}>
        {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  )
}
