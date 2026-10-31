import { useEffect, useRef, useState } from 'react'
import type { NotificationPrefs, Profile, ProfilePatch } from '../service'
import { PRESENCE } from '../../../shared/lib/presence'
import type { SpotifyApi } from '../../spotify/useSpotify'
import type { PresenceStatus, User } from '../../../shared/types'
import Avatar from '../../../shared/components/Avatar'
import { SpotifyLogo } from '../../spotify/components/icons'
import StatusGlyph from '../../../shared/components/StatusGlyph'
import { CameraIcon, CheckIcon, ChevronIcon, CopyIcon, SignOutIcon } from './icons'

type Props = {
  profile: Profile
  update: (patch: ProfilePatch) => Promise<void>
  email: string
  spotify: SpotifyApi
  onSignOut: () => void
  onDeactivate: () => Promise<void>
  onDelete: () => Promise<void>
}

const STATUSES: { status: PresenceStatus; hint: string }[] = [
  { status: 'online', hint: 'You’re around' },
  { status: 'idle', hint: 'Away for now' },
  { status: 'dnd', hint: 'Mutes pop-ups' },
  { status: 'offline', hint: 'Appear offline' },
]

const NOTIFICATIONS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: 'messages', label: 'Messages' },
  { key: 'tags', label: 'Tags in posts' },
  { key: 'friendRequests', label: 'Friend requests' },
]

export default function ProfileCard({ profile, update, email, spotify, onSignOut, onDeactivate, onDelete }: Props) {
  const { user } = profile
  const [error, setError] = useState('')
  // the change shows at once; if the server refuses it, it goes back and the reason shows under the name
  const save = (patch: ProfilePatch) => {
    setError('')
    return update(patch).catch((e: unknown) => {
      setError(e instanceof Error ? e.message : 'Couldn’t save that. Try again.')
      throw e
    })
  }
  const quietly = (patch: ProfilePatch) => void save(patch).catch(() => {})

  return (
    <div className="profile-card" role="dialog" aria-label="Profile">
      <header className="pf-head">
        <AvatarPicker user={user} onPick={(avatar) => save({ avatar })} />
        <div className="pf-who">
          <NameField key={user.name} value={user.name} onSave={(name) => quietly({ name })} />
          <span className="pf-email">{email}</span>
        </div>
      </header>
      {error && (
        <p className="pf-error" role="alert">
          {error}
        </p>
      )}

      <UniqueId id={profile.uniqueId} />

      <section className="pf-section">
        <h3 id="pf-status">Status</h3>
        <div className="pf-status" role="radiogroup" aria-labelledby="pf-status">
          {STATUSES.map(({ status, hint }) => (
            <button key={status} type="button" role="radio" aria-checked={user.status === status} className="pf-status-opt" onClick={() => quietly({ status })}>
              <StatusGlyph status={status} size={12} />
              <span>
                <strong>{PRESENCE[status].label}</strong>
                <small>{hint}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="pf-section">
        <h3>Spotify</h3>
        <SpotifyRow spotify={spotify} />
      </section>

      <section className="pf-section">
        <h3>Notifications</h3>
        <div className="pf-card">
          {NOTIFICATIONS.map(({ key, label }) => (
            <label key={key} className="pf-row">
              <span>{label}</span>
              <input
                type="checkbox"
                role="switch"
                className="pf-switch"
                checked={profile.notifications[key]}
                onChange={(e) => quietly({ notifications: { [key]: e.target.checked } })}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="pf-section">
        <div className="pf-card">
          {/* TODO: the terms page (shared with the sign-up form's link) */}
          <button type="button" className="pf-row is-action">
            <span>Terms and Agreements</span>
            <ChevronIcon />
          </button>
          <button type="button" className="pf-row is-action" onClick={onSignOut}>
            <span>Sign out</span>
            <SignOutIcon />
          </button>
        </div>
      </section>

      <AccountActions
        onDeactivate={async () => {
          await onDeactivate()
          onSignOut()
        }}
        onDelete={async () => {
          await onDelete()
          onSignOut()
        }}
      />
    </div>
  )
}

function AvatarPicker({ user, onPick }: { user: User; onPick: (file: File) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    await onPick(file).catch(() => {}) // the card shows why
    setBusy(false)
  }

  return (
    <div className="pf-avatar">
      <button type="button" className={`pf-avatar-btn${busy ? ' is-busy' : ''}`} aria-label="Change profile picture" title="Change profile picture" onClick={() => input.current?.click()} disabled={busy}>
        <Avatar user={user} size={64} radius={32} />
        <span className="pf-avatar-cam">
          <CameraIcon size={14} />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        hidden
        onChange={(e) => {
          void pick(e.target.files?.[0])
          e.target.value = '' // the same file can be picked again
        }}
      />
    </div>
  )
}

function NameField({ value, onSave }: { value: string; onSave: (name: string) => void }) {
  const [draft, setDraft] = useState(value)
  const commit = () => {
    const name = draft.trim()
    if (!name) setDraft(value) // a name can't be empty
    else if (name !== value) onSave(name)
  }
  return (
    <input
      className="pf-name"
      aria-label="Your name"
      title="Change your name"
      value={draft}
      maxLength={50}
      autoComplete="name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.stopPropagation()
          setDraft(value)
          // blur after the reset has rendered, so the half-typed name isn't saved
          const field = e.currentTarget
          requestAnimationFrame(() => field.blur())
        }
      }}
    />
  )
}

function UniqueId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1600)
    return () => clearTimeout(t)
  }, [copied])

  return (
    <div className="pf-id">
      <span className="pf-id-label">Unique ID</span>
      <code>{id}</code>
      <button
        type="button"
        className="pf-copy"
        aria-label={copied ? 'Copied' : 'Copy your unique ID'}
        title="Friends can find you with this"
        onClick={() => navigator.clipboard?.writeText(id).then(() => setCopied(true), () => {})}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  )
}

// Linking goes through the backend (Spotify's consent page, then back here). Without a Spotify app on the
// server it can't, so the row says so and offers the demo player instead.
function SpotifyRow({ spotify }: { spotify: SpotifyApi }) {
  const state = spotify.mode === 'spotify' ? 'Linked' : spotify.mode === 'demo' ? 'Demo player' : 'Not linked'
  return (
    <>
      <div className={`pf-card pf-spotify${spotify.mode !== 'off' ? ' is-linked' : ''}`}>
        <SpotifyLogo size={26} />
        <span className="pf-spotify-text">
          <strong>Spotify</strong>
          <small>{state}</small>
        </span>
        {spotify.mode !== 'off' ? (
          <button type="button" className="pf-btn" onClick={spotify.disconnect}>
            {spotify.mode === 'demo' ? 'Stop demo' : 'Unlink'}
          </button>
        ) : spotify.configured ? (
          <button type="button" className="pf-btn is-green" onClick={spotify.connect}>
            Link
          </button>
        ) : (
          <button type="button" className="pf-btn" onClick={spotify.startDemo}>
            Try demo
          </button>
        )}
      </div>
      {spotify.mode !== 'spotify' && !spotify.configured && (
        <p className="pf-note">Linking your Spotify account needs a Spotify app set up on the server (see backend/README.md).</p>
      )}
      {spotify.mode === 'demo' && spotify.configured && (
        <p className="pf-note">
          Pretend playback for trying the player.{' '}
          <button type="button" className="pf-inline" onClick={spotify.connect}>
            Link your Spotify
          </button>
        </p>
      )}
    </>
  )
}

function AccountActions({ onDeactivate, onDelete }: { onDeactivate: () => Promise<void>; onDelete: () => Promise<void> }) {
  const [confirm, setConfirm] = useState<'deactivate' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)

  if (confirm) {
    const deleting = confirm === 'delete'
    return (
      <div className="pf-confirm" role="alertdialog" aria-label={deleting ? 'Delete account' : 'Deactivate account'}>
        <p>
          {deleting
            ? 'Delete your account for good? Your posts, albums and messages are removed, and this can’t be undone.'
            : 'Deactivate your account? Your profile and posts are hidden until you sign in again.'}
        </p>
        <div className="pf-confirm-actions">
          <button type="button" className="pf-btn" onClick={() => setConfirm(null)} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="pf-btn is-danger"
            autoFocus
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await (deleting ? onDelete() : onDeactivate())
            }}
          >
            {deleting ? 'Delete account' : 'Deactivate'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pf-danger">
      <button type="button" onClick={() => setConfirm('deactivate')}>
        Deactivate account
      </button>
      <button type="button" className="is-red" onClick={() => setConfirm('delete')}>
        Delete account
      </button>
    </div>
  )
}
