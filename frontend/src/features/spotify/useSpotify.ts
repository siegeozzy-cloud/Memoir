import { useCallback, useEffect, useState } from 'react'
import { demoSource } from './demoSource'
import { connect, linkStatus, takeLinkResult, unlink } from './link'
import { spotifySource } from './spotifySource'
import { SpotifyUnlinkedError, type Playback, type RepeatMode } from './types'

type SpotifyMode = 'off' | 'spotify' | 'demo'

const MODE = 'memoir.spotify.mode'
const LYRICS = 'memoir.spotify.lyrics'
const REPEAT_NEXT: Record<RepeatMode, RepeatMode> = { off: 'context', context: 'track', track: 'off' }
// read once per page load: the result of linking, when the backend has just sent the browser back
const linkResult = takeLinkResult()

/** Now-playing state and controls for the linked Spotify account (or the demo player). */
export function useSpotify(signedIn: boolean) {
  const [chosen, setMode] = useState<SpotifyMode>(() => (localStorage.getItem(MODE) === 'demo' ? 'demo' : 'off'))
  const [configured, setConfigured] = useState(false)
  // a linked account belongs to whoever is signed in
  const mode: SpotifyMode = chosen === 'spotify' && !signedIn ? 'off' : chosen
  // tagged with the source it came from, so switching demo ↔ Spotify never shows the other's song
  const [snap, setSnap] = useState<{ kind: string; playback: Playback | null }>({ kind: 'off', playback: null })
  const [notice, setNotice] = useState<string | null>(linkResult)
  const [lyricsOn, setLyricsOn] = useState(() => localStorage.getItem(LYRICS) === 'on')
  const source = mode === 'spotify' ? spotifySource : mode === 'demo' ? demoSource : null
  const playback = source && snap.kind === source.kind ? snap.playback : null
  const setPlayback = useCallback(
    (next: Playback | null | ((p: Playback | null) => Playback | null)) =>
      setSnap((s) => ({ kind: s.kind, playback: typeof next === 'function' ? next(s.playback) : next })),
    [],
  )

  // is there a linked account (and can there be one: is Spotify set up on the server)?
  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    linkStatus().then(
      (s) => {
        if (cancelled) return
        setConfigured(s.configured)
        if (s.linked) setMode('spotify')
        else setMode((m) => (m === 'spotify' ? 'off' : m))
      },
      () => !cancelled && setConfigured(false), // no backend (VITE_API=mock): the demo stands in
    )
    return () => {
      cancelled = true
    }
  }, [signedIn])

  useEffect(() => {
    localStorage.setItem(LYRICS, lyricsOn ? 'on' : 'off')
  }, [lyricsOn])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])

  const refresh = useCallback(async () => {
    if (!source) return
    try {
      const playback = await source.current()
      setSnap({ kind: source.kind, playback })
    } catch (e) {
      if (e instanceof SpotifyUnlinkedError) {
        setMode('off')
        setNotice(e.message)
      }
    }
  }, [source])

  // poll while the page is visible (Spotify has no push API for the web)
  useEffect(() => {
    if (!source) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async: state is set after the network call
    refresh()
    const every = source.kind === 'demo' ? 1000 : 4000
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(), every)
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [source, refresh])

  const control = useCallback(
    async (run: () => Promise<void>, optimistic?: (p: Playback) => Playback) => {
      if (!source) return
      if (optimistic) setPlayback((p) => (p ? optimistic(p) : p))
      try {
        await run()
      } catch (e) {
        // the server's messages are written to be shown: Premium needed, no active device, …
        setNotice(e instanceof Error ? e.message : 'Spotify didn’t respond. Try again.')
      }
      setTimeout(refresh, 350) // let Spotify catch up, then show the real state
    },
    [source, refresh, setPlayback],
  )

  const progressOf = (p: Playback) => Math.min(p.track.durationMs, p.progressMs + (p.isPlaying ? Date.now() - p.at : 0))

  return {
    mode,
    configured,
    playback,
    notice,
    lyricsOn,
    toggleLyrics: () => setLyricsOn((on) => !on),
    togglePlay: () =>
      control(
        () => (playback?.isPlaying ? source!.pause() : source!.play()),
        (p) => ({ ...p, isPlaying: !p.isPlaying, progressMs: progressOf(p), at: Date.now() }),
      ),
    next: () => control(() => source!.next()),
    previous: () => control(() => source!.previous()),
    seek: (ms: number) => control(() => source!.seek(ms), (p) => ({ ...p, progressMs: ms, at: Date.now() })),
    cycleRepeat: () =>
      control(
        () => source!.setRepeat(REPEAT_NEXT[playback?.repeat ?? 'off']),
        (p) => ({ ...p, repeat: REPEAT_NEXT[p.repeat] }),
      ),
    connect: () => {
      localStorage.removeItem(MODE)
      connect().catch(() => setNotice('Couldn’t reach Spotify. Try again.'))
    },
    startDemo: () => {
      localStorage.setItem(MODE, 'demo')
      setMode('demo')
    },
    disconnect: () => {
      if (mode === 'spotify') unlink().catch(() => setNotice('Couldn’t unlink Spotify. Try again.'))
      localStorage.removeItem(MODE)
      setMode('off')
    },
  }
}

export type SpotifyApi = ReturnType<typeof useSpotify>

/** Playback position in ms, ticking along while the song plays. */
export function usePlaybackPosition(p: Playback | null, everyMs = 250) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!p?.isPlaying) return
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [p, everyMs])
  if (!p) return 0
  return Math.min(p.track.durationMs, p.progressMs + (p.isPlaying ? Math.max(0, now - p.at) : 0))
}
