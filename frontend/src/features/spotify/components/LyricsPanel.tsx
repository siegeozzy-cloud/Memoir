import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { currentLine, fetchLyrics, type Lyrics } from '../lyrics'
import { usePlaybackPosition, type SpotifyApi } from '../useSpotify'

// Synced lyrics on the left, like Spotify: the line being sung is green, and the text slides up
// as the song goes. It's clipped to its frame. Click a line to jump there.
export default function LyricsPanel({ spotify, shown }: { spotify: SpotifyApi; shown: boolean }) {
  const p = spotify.playback
  const track = p?.track
  const [lyrics, setLyrics] = useState<{ trackId: string; value: Lyrics | 'loading' | 'error' } | null>(null)
  const pos = usePlaybackPosition(shown ? p : null, 200)
  const list = useRef<HTMLOListElement>(null)
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    if (!track || !shown) return
    let cancelled = false // until this resolves, a new track reads as 'loading' (see `value` below)
    fetchLyrics(track).then(
      (value) => !cancelled && setLyrics({ trackId: track.id, value }),
      () => !cancelled && setLyrics({ trackId: track.id, value: 'error' }),
    )
    return () => {
      cancelled = true
    }
  }, [track, shown])

  const value = lyrics && track && lyrics.trackId === track.id ? lyrics.value : 'loading'
  const synced = typeof value === 'object' && value.kind === 'synced' ? value.lines : null
  const cur = synced ? currentLine(synced, pos + 150) : -1 // a touch early, so the highlight lands with the voice

  // keep the current line at the top of the frame
  useLayoutEffect(() => {
    const el = list.current?.children[Math.max(0, cur)] as HTMLElement | undefined
    setOffset(el ? el.offsetTop : 0)
  }, [cur, synced])

  let status: string | null = null
  if (value === 'loading') status = 'Finding lyrics…'
  else if (value === 'error') status = 'Couldn’t load lyrics right now.'
  else if (value.kind === 'instrumental') status = 'Instrumental. Enjoy the music.'
  else if (value.kind === 'none') status = 'No lyrics for this song yet.'

  return (
    <aside className={`lyrics${shown ? ' is-shown' : ''}`} aria-label="Lyrics" aria-hidden={!shown}>
      {status ? (
        <p className="lyrics-status">{status}</p>
      ) : synced ? (
        <ol className="lyrics-lines" ref={list} style={{ transform: `translateY(${-offset}px)` }}>
          {synced.map((l, i) => (
            <li key={`${l.timeMs}-${i}`} className={i === cur ? 'is-current' : i < cur ? 'is-past' : undefined} aria-current={i === cur || undefined}>
              <button type="button" tabIndex={-1} onClick={() => spotify.seek(l.timeMs)}>
                {l.text || '♪'}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        typeof value === 'object' &&
        value.kind === 'plain' && (
          <ol className="lyrics-lines is-plain" ref={list}>
            <li className="lyrics-note">Not synced to the song</li>
            {value.lines.map((line, i) => (
              <li key={i}>{line || ' '}</li>
            ))}
          </ol>
        )
      )}
    </aside>
  )
}
