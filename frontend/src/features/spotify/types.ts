export type Track = {
  id: string
  title: string
  /** "Frank Ocean" or "Artist A, Artist B" */
  artists: string
  album: string
  artUrl?: string
  durationMs: number
}

export type RepeatMode = 'off' | 'context' | 'track'

export type Playback = {
  track: Track
  isPlaying: boolean
  progressMs: number
  /** Date.now() when progressMs was measured; the UI moves the bar on from there. */
  at: number
  repeat: RepeatMode
}

/** Where playback comes from: the user's Spotify account, or the built-in demo. */
export interface PlayerSource {
  readonly kind: 'spotify' | 'demo'
  /** null when nothing is playing (or no device is active). */
  current(): Promise<Playback | null>
  /**
   * Told about every change after `current()`, so the player needn't ask again. The real source
   * listens to the WebSocket, which the server pushes to when a track changes; the demo leaves this
   * out and is polled instead, since it costs nothing to ask something running in the same tab.
   */
  subscribe?(listener: (playback: Playback | null) => void): () => void
  play(): Promise<void>
  pause(): Promise<void>
  next(): Promise<void>
  previous(): Promise<void>
  seek(ms: number): Promise<void>
  setRepeat(mode: RepeatMode): Promise<void>
}

/** Spotify refuses playback control for free accounts. */
export class PremiumRequiredError extends Error {
  constructor() {
    super('Spotify Premium is needed to control playback.')
  }
}

/** The link was removed, e.g. access revoked in the person's Spotify settings. */
export class SpotifyUnlinkedError extends Error {
  constructor() {
    super('Spotify was disconnected. Link it again in your profile.')
  }
}
