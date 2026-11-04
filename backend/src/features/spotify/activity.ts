import { inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.ts'
import { spotifyLinks, users } from '../../db/schema.ts'
import { onlineUserIds, send, setActivity } from '../../lib/realtime.ts'
import { spotifyApi } from './client.ts'
import { playbackSignature, toPlayback, type ApiPlayer, type Playback } from './playback.ts'

// Two things come out of one question to Spotify: "Listening to Spotify" on a friend's name, like
// Discord, and the now-playing bar in the person's own player. Spotify has no way to tell us when a
// song changes, so the server asks — once per person per sweep, for everyone who has an open tab and
// a linked account — and pushes what changed down the WebSocket.
//
// The tabs used to ask for themselves, every four seconds each. That was ~900 requests an hour per
// open tab, which on a metered free plan was most of the month's bandwidth; asking here instead costs
// one message per track change.

const EVERY_MS = 15_000
/** Spotify calls in flight at once. Its API answers a burst from one app with 429s. */
const AT_ONCE = 5
/** A position this far from where it should have drifted to is a seek, which the tab wants to know. */
const SEEK_MS = 4000

/** What was last pushed to each person, so an unchanged song sends nothing. */
type Sent = { signature: string; progressMs: number; at: number }
const sent = new Map<string, Sent>()

/** Runs `work` over `items`, no more than `limit` at a time. */
async function mapLimit<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++])
  })
  await Promise.all(runners)
}

/**
 * Sends this person's playback to their open tabs, unless it is the same song still ticking along.
 * `null` means nothing is playing, which is also worth sending once.
 */
function pushPlayback(userId: string, playback: Playback | null) {
  const signature = playbackSignature(playback)
  const now = Date.now()
  const before = sent.get(userId)
  // where the tab's own clock will have carried the bar to by now
  const expected = before && playback?.isPlaying ? before.progressMs + (now - before.at) : before?.progressMs
  const seeked = before !== undefined && playback !== null && expected !== undefined && Math.abs(expected - playback.progressMs) > SEEK_MS
  if (before?.signature === signature && !seeked) return
  sent.set(userId, { signature, progressMs: playback?.progressMs ?? 0, at: now })
  send(userId, { channel: 'spotify', event: { type: 'playback', playback } })
}

/**
 * One pass over everyone with an open tab. Two queries for the whole sweep, whatever the number of
 * people — it used to be two per person, which at fifty online was a query every few milliseconds
 * against a database that bills by the time it spends awake.
 */
async function sweep(app: FastifyInstance) {
  const online = onlineUserIds()
  for (const id of [...sent.keys()]) if (!online.includes(id)) sent.delete(id)
  if (!online.length) return

  const [people, links] = await Promise.all([
    db.select({ id: users.id, status: users.status, shareActivity: users.shareActivity }).from(users).where(inArray(users.id, online)),
    db.select({ userId: spotifyLinks.userId }).from(spotifyLinks).where(inArray(spotifyLinks.userId, online)),
  ])
  const linked = new Set(links.map((l) => l.userId))

  // no linked account: nothing to ask Spotify, and nothing to show on their name
  for (const person of people) {
    if (linked.has(person.id)) continue
    sent.delete(person.id)
    await setActivity(person.id, null)
  }

  /**
   * Everyone with a link gets asked, whatever their status. Appearing offline is Discord's invisible
   * — they are still using the app, so their own player has to keep working; it is only what their
   * friends see that is held back, below.
   */
  const asking = people.filter((p) => linked.has(p.id))
  await mapLimit(asking, AT_ONCE, async (person) => {
    let playback: Playback | null
    try {
      playback = toPlayback((await spotifyApi(person.id, '/me/player')) as ApiPlayer | null)
    } catch (e) {
      app.log.debug({ err: e }, 'Spotify activity poll failed')
      // Only a link that has actually gone means they've stopped listening. A rate limit or a bad
      // minute at Spotify's end says nothing about what is playing, so leave the song where it is and
      // ask again next sweep — clearing it would blink the player and the label off and on again.
      if ((e as { code?: string }).code === 'spotify-unlinked') {
        sent.delete(person.id)
        await setActivity(person.id, null)
      }
      return
    }

    // their own player, which is the whole reason this runs for people nobody can see
    pushPlayback(person.id, playback)

    // and the label on their name: not while paused, not if they've turned sharing off, and not
    // while they're appearing offline
    const visible = person.shareActivity && person.status !== 'offline'
    const showing = playback?.isPlaying && visible ? playback : null
    await setActivity(person.id, showing ? { kind: 'spotify', track: showing.track.title, artist: showing.track.artists } : null)
  })
}

export function startActivityPolling(app: FastifyInstance) {
  const timer = setInterval(() => void sweep(app).catch((e) => app.log.debug({ err: e }, 'activity sweep')), EVERY_MS)
  timer.unref()
  return () => clearInterval(timer)
}
