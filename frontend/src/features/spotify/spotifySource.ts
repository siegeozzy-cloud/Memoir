import { api, ApiError } from '../../shared/lib/api'
import { PremiumRequiredError, SpotifyUnlinkedError, type Playback, type PlayerSource, type RepeatMode } from './types'

// The user's own Spotify playback, through the backend (/api/spotify/player), which calls
// Spotify's Web API with the stored token. Reading works on any account; controls need Premium.

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
  play: () => control('PUT', '/play'),
  pause: () => control('PUT', '/pause'),
  next: () => control('POST', '/next'),
  previous: () => control('POST', '/previous'),
  seek: (ms) => control('PUT', '/seek', { positionMs: Math.max(0, Math.round(ms)) }),
  setRepeat: (mode: RepeatMode) => control('PUT', '/repeat', { mode }),
}
