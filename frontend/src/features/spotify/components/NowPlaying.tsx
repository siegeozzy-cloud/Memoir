import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { usePlaybackPosition, type SpotifyApi } from '../useSpotify'
import { LyricsIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, RepeatIcon, SpotifyLogo } from './icons'

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const REPEAT_LABEL = { off: 'Repeat: off', context: 'Repeat: on', track: 'Repeat: this song' } as const

/** Marquee: px a second, and the empty run between the text and its copy. */
const SCROLL_SPEED = 38
const SCROLL_GAP = 32

// A line that slides right-to-left, on a loop, when the name is too long for the tab. Short
// names sit still. The copy behind it makes the wrap-around seamless.
function Scroller({ className, text }: { className: string; text: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [shift, setShift] = useState(0)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => {
      const first = el.firstElementChild?.firstElementChild as HTMLElement | undefined
      if (!first) return
      // the first copy keeps its natural width whether or not the copy is there, so this is stable
      setShift(first.scrollWidth - el.clientWidth > 1 ? first.scrollWidth + SCROLL_GAP : 0)
    }
    measure()
    const ro = new ResizeObserver(measure) // the tab is narrower while collapsed
    ro.observe(el)
    return () => ro.disconnect()
  }, [text])

  const style = { '--shift': `${shift}px`, animationDuration: `${shift / SCROLL_SPEED}s` } as CSSProperties

  return (
    <div className={`np-scroll ${className}${shift ? ' is-scrolling' : ''}`} ref={box} title={text}>
      <span className="np-scroll-track" style={shift ? style : undefined}>
        <span>{text}</span>
        {shift > 0 && <span aria-hidden="true">{text}</span>}
      </span>
    </div>
  )
}

// The top-centre tab from the design, while Spotify is linked and something is playing. It rests
// as a small pill with the artwork and the name, and opens into the full player under the cursor.
// It steps aside (slides up) while a notification uses the same spot.
export default function NowPlaying({ spotify, hidden }: { spotify: SpotifyApi; hidden: boolean }) {
  const { playback: p } = spotify
  const pos = usePlaybackPosition(p)
  const bar = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const pct = p ? (pos / p.track.durationMs) * 100 : 0
  const shown = !!p && !hidden

  const seekAt = (clientX: number) => {
    const r = bar.current?.getBoundingClientRect()
    if (!r || !p) return
    spotify.seek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * p.track.durationMs)
  }

  return (
    <section
      className={`np${shown ? ' is-shown' : ''}${open && shown ? ' is-open' : ''}`}
      aria-label="Now playing on Spotify"
      aria-hidden={!shown}
      inert={!shown}
      // the pill itself takes focus, which opens it: the controls inside are out of the tab
      // order until then, so nobody lands on a button they can't see
      tabIndex={shown ? 0 : -1}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      {p && (
        <>
          <SpotifyLogo className="np-watermark" size={100} />
          <div className="np-head">
            {p.track.artUrl ? <img className="np-art" src={p.track.artUrl} alt="" /> : <span className="np-art" />}
            <div className="np-meta">
              <Scroller className="np-title" text={p.track.title} />
              <Scroller className="np-artist" text={p.track.artists} />
            </div>
          </div>
          <div className="np-fold" inert={!open}>
            <div className="np-controls">
              <button
                type="button"
                className={`np-btn${spotify.lyricsOn ? ' is-on' : ''}`}
                aria-pressed={spotify.lyricsOn}
                aria-label="Lyrics"
                title={spotify.lyricsOn ? 'Hide lyrics' : 'Show lyrics'}
                onClick={spotify.toggleLyrics}
              >
                <LyricsIcon size={21} />
              </button>
              <button type="button" className="np-btn" aria-label="Previous" title="Previous" onClick={spotify.previous}>
                <PrevIcon size={20} />
              </button>
              <button type="button" className="np-btn np-play" aria-label={p.isPlaying ? 'Pause' : 'Play'} title={p.isPlaying ? 'Pause' : 'Play'} onClick={spotify.togglePlay}>
                {p.isPlaying ? <PauseIcon size={25} /> : <PlayIcon size={25} />}
              </button>
              <button type="button" className="np-btn" aria-label="Next" title="Next" onClick={spotify.next}>
                <NextIcon size={20} />
              </button>
              <button
                type="button"
                className={`np-btn${p.repeat !== 'off' ? ' is-on' : ''}`}
                aria-label={REPEAT_LABEL[p.repeat]}
                title={REPEAT_LABEL[p.repeat]}
                onClick={spotify.cycleRepeat}
              >
                <RepeatIcon size={21} one={p.repeat === 'track'} />
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
