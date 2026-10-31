import { useRef } from 'react'
import { usePlaybackPosition, type SpotifyApi } from '../useSpotify'
import { LyricsIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, RepeatIcon, SpotifyLogo } from './icons'

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const REPEAT_LABEL = { off: 'Repeat: off', context: 'Repeat: on', track: 'Repeat: this song' } as const

// The top-centre tab from the design, while Spotify is linked and something is playing.
// It steps aside (slides up) while a notification uses the same spot.
export default function NowPlaying({ spotify, hidden }: { spotify: SpotifyApi; hidden: boolean }) {
  const { playback: p } = spotify
  const pos = usePlaybackPosition(p)
  const bar = useRef<HTMLDivElement>(null)
  const pct = p ? (pos / p.track.durationMs) * 100 : 0
  const shown = !!p && !hidden

  const seekAt = (clientX: number) => {
    const r = bar.current?.getBoundingClientRect()
    if (!r || !p) return
    spotify.seek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * p.track.durationMs)
  }

  return (
    <section className={`np${shown ? ' is-shown' : ''}`} aria-label="Now playing on Spotify" aria-hidden={!shown} inert={!shown}>
      {p && (
        <>
          <SpotifyLogo className="np-watermark" size={150} />
          {p.track.artUrl ? <img className="np-art" src={p.track.artUrl} alt="" /> : <span className="np-art" />}
          <div className="np-main">
            <p className="np-title" title={`${p.track.artists} - ${p.track.title}`}>
              {p.track.artists} - {p.track.title}
            </p>
            <div className="np-controls">
              <button
                type="button"
                className={`np-btn${spotify.lyricsOn ? ' is-on' : ''}`}
                aria-pressed={spotify.lyricsOn}
                aria-label="Lyrics"
                title={spotify.lyricsOn ? 'Hide lyrics' : 'Show lyrics'}
                onClick={spotify.toggleLyrics}
              >
                <LyricsIcon />
              </button>
              <button type="button" className="np-btn" aria-label="Previous" title="Previous" onClick={spotify.previous}>
                <PrevIcon />
              </button>
              <button type="button" className="np-btn np-play" aria-label={p.isPlaying ? 'Pause' : 'Play'} title={p.isPlaying ? 'Pause' : 'Play'} onClick={spotify.togglePlay}>
                {p.isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button type="button" className="np-btn" aria-label="Next" title="Next" onClick={spotify.next}>
                <NextIcon />
              </button>
              <button
                type="button"
                className={`np-btn${p.repeat !== 'off' ? ' is-on' : ''}`}
                aria-label={REPEAT_LABEL[p.repeat]}
                title={REPEAT_LABEL[p.repeat]}
                onClick={spotify.cycleRepeat}
              >
                <RepeatIcon one={p.repeat === 'track'} />
              </button>
            </div>
            <div
              className="np-bar"
              ref={bar}
              role="slider"
              tabIndex={0}
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(p.track.durationMs / 1000)}
              aria-valuenow={Math.round(pos / 1000)}
              aria-valuetext={`${mmss(pos)} of ${mmss(p.track.durationMs)}`}
              onClick={(e) => seekAt(e.clientX)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') spotify.seek(Math.max(0, pos - 5000))
                else if (e.key === 'ArrowRight') spotify.seek(Math.min(p.track.durationMs, pos + 5000))
                else return
                e.preventDefault()
              }}
            >
              <span className="np-fill" style={{ width: `${pct}%` }} />
              <span className="np-dot" style={{ left: `${pct}%` }} />
            </div>
            <div className="np-times">
              <span>{mmss(pos)}</span>
              <span>{mmss(p.track.durationMs)}</span>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
