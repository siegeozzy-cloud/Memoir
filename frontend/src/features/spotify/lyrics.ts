import type { Track } from './types'

// Time-synced lyrics from LRCLIB (https://lrclib.net), a free, open lyrics database with no API key.
// Spotify's Web API doesn't provide lyrics. For a public release, check the lyrics licensing you need.

export type LyricLine = { timeMs: number; text: string }

export type Lyrics =
  | { kind: 'synced'; lines: LyricLine[] }
  | { kind: 'plain'; lines: string[] }
  | { kind: 'instrumental' }
  | { kind: 'none' }

type LrclibRecord = { duration: number; instrumental: boolean; plainLyrics: string | null; syncedLyrics: string | null }

const cache = new Map<string, Promise<Lyrics>>()

/** Parses LRC: "[01:02.34] text" (a line may carry several timestamps). */
function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = []
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    if (!stamps.length) continue
    const text = raw.replace(/\[[^\]]*\]/g, '').trim()
    for (const s of stamps) out.push({ timeMs: Math.round((Number(s[1]) * 60 + Number(s[2])) * 1000), text })
  }
  return out.sort((a, b) => a.timeMs - b.timeMs)
}

function toLyrics(r: LrclibRecord | null): Lyrics {
  if (!r) return { kind: 'none' }
  if (r.instrumental) return { kind: 'instrumental' }
  if (r.syncedLyrics) {
    const lines = parseLrc(r.syncedLyrics)
    if (lines.length) return { kind: 'synced', lines }
  }
  if (r.plainLyrics) return { kind: 'plain', lines: r.plainLyrics.split(/\r?\n/) }
  return { kind: 'none' }
}

async function lookup(track: Track): Promise<Lyrics> {
  const artist = track.artists.split(',')[0].trim()
  const exact = new URLSearchParams({ track_name: track.title, artist_name: artist, album_name: track.album, duration: String(Math.round(track.durationMs / 1000)) })
  const r = await fetch(`https://lrclib.net/api/get?${exact}`)
  if (r.ok) return toLyrics(await r.json())
  if (r.status !== 404) throw new Error(`lrclib: ${r.status}`)
  // no exact match (album or length differ slightly): search, and take the closest length with synced lyrics
  const s = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: track.title, artist_name: artist })}`)
  if (!s.ok) throw new Error(`lrclib search: ${s.status}`)
  const results = (await s.json()) as LrclibRecord[]
  const target = track.durationMs / 1000
  const best = results
    .filter((x) => Math.abs(x.duration - target) <= 8)
    .sort((a, b) => Number(!!b.syncedLyrics) - Number(!!a.syncedLyrics) || Math.abs(a.duration - target) - Math.abs(b.duration - target))[0]
  return toLyrics(best ?? null)
}

export function fetchLyrics(track: Track): Promise<Lyrics> {
  const key = `${track.artists}|${track.title}|${Math.round(track.durationMs / 1000)}`
  let p = cache.get(key)
  if (!p) {
    p = lookup(track).catch((e) => {
      cache.delete(key) // try again next time
      throw e
    })
    cache.set(key, p)
  }
  return p
}

/** Index of the line being sung at `ms` (-1 before the first line). */
export function currentLine(lines: LyricLine[], ms: number) {
  let lo = 0, hi = lines.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].timeMs <= ms) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}
