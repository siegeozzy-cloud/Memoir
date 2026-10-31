import type { Playback, PlayerSource, RepeatMode, Track } from './types'

// A pretend player for trying the now-playing tab and lyrics before a Spotify app is set up.
// Real song titles so the lyrics lookup has something to find; the cover art is a placeholder.

function cover(seed: number, a: string, b: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g${seed}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="64" height="64" fill="url(#g${seed})"/><circle cx="32" cy="32" r="13" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2"/><circle cx="32" cy="32" r="3" fill="#fff" fill-opacity=".8"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const TRACKS: Track[] = [
  { id: 'demo-pink-white', title: 'Pink + White', artists: 'Frank Ocean', album: 'Blonde', durationMs: 184_000, artUrl: cover(1, '#f6c1c9', '#8a6f7d') },
  { id: 'demo-505', title: '505', artists: 'Arctic Monkeys', album: 'Favourite Worst Nightmare', durationMs: 253_000, artUrl: cover(2, '#2b2f3a', '#a4475b') },
  { id: 'demo-here-with-me', title: 'Here With Me', artists: 'd4vd', album: 'Petals to Thorns', durationMs: 242_000, artUrl: cover(3, '#86b6d9', '#3d4f7a') },
]

let index = 0
let playing = true
let base = 0 // progress (ms) at `since`
let since = 0 // set on first use, so the demo starts at 0:00 when it's switched on
let repeat: RepeatMode = 'off'

const progress = () => Math.min(TRACKS[index].durationMs, base + (playing ? Date.now() - since : 0))
const jump = (i: number) => {
  index = (i + TRACKS.length) % TRACKS.length
  base = 0
  since = Date.now()
}

export const demoSource: PlayerSource = {
  kind: 'demo',
  async current(): Promise<Playback> {
    if (!since) since = Date.now()
    if (progress() >= TRACKS[index].durationMs) jump(repeat === 'track' ? index : index + 1) // song ended
    return { track: TRACKS[index], isPlaying: playing, progressMs: progress(), at: Date.now(), repeat }
  },
  async play() {
    if (!playing) since = Date.now()
    playing = true
  },
  async pause() {
    base = progress()
    playing = false
  },
  async next() {
    jump(index + 1)
  },
  async previous() {
    // like Spotify: restart the song unless it has only just begun
    if (progress() > 3000) jump(index)
    else jump(index - 1)
  },
  async seek(ms) {
    base = Math.max(0, Math.min(ms, TRACKS[index].durationMs))
    since = Date.now()
  },
  async setRepeat(mode) {
    repeat = mode
  },
}
