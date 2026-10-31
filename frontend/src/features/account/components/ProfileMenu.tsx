import { useEffect, useRef, useState } from 'react'
import type { ProfileApi } from '../useProfile'
import { PRESENCE } from '../../../shared/lib/presence'
import type { SpotifyApi } from '../../spotify/useSpotify'
import Avatar from '../../../shared/components/Avatar'
import StatusGlyph from '../../../shared/components/StatusGlyph'
import ProfileCard from './ProfileCard'
import './profile.css'

type Props = {
  profileApi: ProfileApi
  email: string
  spotify: SpotifyApi
  onSignOut: () => void
}

// The round profile button (top right) and the profile card that drops down from it.
// A card rather than a side panel: these are quick, occasional settings, and the globe stays in view.
export default function ProfileMenu({ profileApi, email, spotify, onSignOut }: Props) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const { profile } = profileApi

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    // a click on the globe moves focus into its iframe (a file picker opening doesn't)
    const blur = () => setTimeout(() => document.activeElement instanceof HTMLIFrameElement && setOpen(false))
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (e.target instanceof HTMLInputElement && root.current?.contains(e.target)) return // the field cancels its edit first
      e.stopPropagation()
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener('pointerdown', away)
    window.addEventListener('blur', blur)
    window.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('pointerdown', away)
      window.removeEventListener('blur', blur)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])

  if (!profile) return null
  const { user } = profile

  return (
    <div className="profile" ref={root}>
      <button
        ref={button}
        type="button"
        className="profile-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Profile: ${user.name}, ${PRESENCE[user.status].label}`}
        title="Profile"
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar user={user} size={36} radius={18} />
        <span className="profile-badge">
          <StatusGlyph status={user.status} size={10} />
        </span>
      </button>
      {open && <ProfileCard profile={profile} update={profileApi.update} email={email} spotify={spotify} onSignOut={onSignOut} onDeactivate={profileApi.deactivate} onDelete={profileApi.remove} />}
    </div>
  )
}
