import { api, ApiError } from '../../shared/lib/api'
import { onChannel } from '../../shared/lib/socket'
import { PremiumRequiredError, SpotifyUnlinkedError, type Playback, type PlayerSource, type RepeatMode } from './types'

// The user's own Spotify playback, through the backend (/api/spotify/player), which calls
// Spotify's Web API with the stored token. Reading works on any account; controls need Premium.
//
// The player asks once, when it opens, and is then told about changes over the WebSocket: the server
// is already asking Spotify every few seconds for the "Listening to" label on friends' names, so it
// shares that answer instead of every tab asking for itself four times a minute.

async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (e) {
    if (e instanceof ApiError && e.code === 'premium-required') throw new PremiumRequiredError()
    if (e instanceof ApiError && e.code === 'spotify-unlinked') throw new SpotifyUnlinkedError()
    throw e
  }
}

const control = (method: 'PUT' | 'POST', path: string, json?: object) => call(() => api<void>(`/spotify/player${path}`, { method, json }))

export const spotifySource: PlayerSource = {
  kind: 'spotify',
  async current(): Promise<Playback | null> {
    const { playback } = await call(() => api<{ playback: Omit<Playback, 'at'> | null }>('/spotify/player'))
    return playback && { ...playback, at: Date.now() }
  },
  subscribe(listener) {
    return onChannel('spotify', (push) => {
      const event = push.event as { type: string; playback: Omit<Playback, 'at'> | null } | undefined
      if (event?.type !== 'playback') return
      // stamped on arrival, like current(): the bar moves on from here by the tab's own clock
      listener(event.playback ? { ...event.playback, at: Date.now() } : null)
    })
  },
  play: () => control('PUT', '/play'),
  pause: () => control('PUT', '/pause'),
  next: () => control('POST', '/next'),
  previous: () => control('POST', '/previous'),
  seek: (ms) => control('PUT', '/seek', { positionMs: Math.max(0, Math.round(ms)) }),
  setRepeat: (mode: RepeatMode) => control('PUT', '/repeat', { mode }),
}
