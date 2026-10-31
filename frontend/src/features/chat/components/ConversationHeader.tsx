import { PRESENCE } from '../../../shared/lib/presence'
import type { User } from '../../../shared/types'
import Avatar from '../../../shared/components/Avatar'
import { MoreIcon, PhoneIcon, SpotifyIcon, VideoIcon } from './icons'

export type CallKind = 'voice' | 'video'

type Props = {
  user: User
  nickname?: string
  infoOpen: boolean
  onToggleInfo: () => void
  onCall?: (kind: CallKind) => void
}

export default function ConversationHeader({ user, nickname, infoOpen, onToggleInfo, onCall }: Props) {
  const presence = PRESENCE[user.status]
  const name = nickname || user.name
  return (
    <header className="convo-header">
      <Avatar user={user} size={58} radius={12} />
      <div className="convo-who">
        <span className="convo-name" title={nickname ? `${nickname} (${user.name})` : user.name}>
          {name}
        </span>
        <span className="convo-status" style={{ color: user.status === 'online' ? presence.color : undefined }}>
          {presence.label}
        </span>
      </div>

      {/* Rich presence. Placeholder data for now; later fed by the Spotify Web API (currently playing). */}
      {user.activity?.kind === 'spotify' && (
        <div className="convo-activity" title={`${user.activity.artist} – ${user.activity.track}`}>
          <span className="activity-kind">
            Listening To Spotify <SpotifyIcon />
          </span>
          <span className="activity-track">
            {user.activity.artist} - {user.activity.track}
          </span>
        </div>
      )}

      <div className="convo-actions">
        <button type="button" className="icon-btn" aria-label={`Voice call ${name}`} title="Voice call" onClick={() => onCall?.('voice')}>
          <PhoneIcon />
        </button>
        <button type="button" className="icon-btn" aria-label={`Video call ${name}`} title="Video call" onClick={() => onCall?.('video')}>
          <VideoIcon />
        </button>
        <button
          type="button"
          className="icon-btn more-btn"
          aria-label={infoOpen ? 'Back to conversation' : 'Conversation info'}
          title={infoOpen ? 'Back to conversation' : 'Conversation info'}
          aria-pressed={infoOpen}
          onClick={onToggleInfo}
        >
          <MoreIcon />
        </button>
      </div>
    </header>
  )
}
