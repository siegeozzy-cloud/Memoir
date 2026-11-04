// Spotify's player response, shaped into what the web app's Spotify bar expects.
//
// Two things need this: the /player route, which answers a tab's first question, and the background
// sweep in activity.ts, which pushes every change after that down the WebSocket. They share the
// shaping so a pushed update and a fetched one are the same object.

export type ApiPlayer = {
  is_playing: boolean
  progress_ms: number | null
  repeat_state: 'off' | 'context' | 'track'
  item: {
    id: string
    name: string
    duration_ms: number
    type: string
    artists?: { name: string }[]
    album?: { name: string; images?: { url: string; width: number }[] }
  } | null
}

/** Matches the web app's `Playback`, minus `at` (the app stamps the time it received it). */
export type Playback = {
  track: { id: string; title: string; artists: string; album: string; artUrl?: string; durationMs: number }
  isPlaying: boolean
  progressMs: number
  repeat: 'off' | 'context' | 'track'
}

export function toPlayback(p: ApiPlayer | null): Playback | null {
  if (!p?.item || p.item.type !== 'track') return null // nothing playing, an ad, or a podcast
  const images = p.item.album?.images ?? []
  const art = images.find((i) => i.width <= 320) ?? images[images.length - 1]
  return {
    track: {
      id: p.item.id,
      title: p.item.name,
      artists: (p.item.artists ?? []).map((a) => a.name).join(', '),
      album: p.item.album?.name ?? '',
      artUrl: art?.url,
      durationMs: p.item.duration_ms,
    },
    isPlaying: p.is_playing,
    progressMs: p.progress_ms ?? 0,
    repeat: p.repeat_state,
  }
}

/**
 * Everything about the playback except the position, which moves on by itself.
 *
 * The app works the position out from the last one it was given and the clock, so a song that is
 * simply playing needs nothing sent to it. Only a change to this — a different track, paused or
 * resumed, repeat switched — is news.
 */
export const playbackSignature = (p: Playback | null) => (p ? `${p.track.id}:${p.isPlaying}:${p.repeat}` : 'none')
