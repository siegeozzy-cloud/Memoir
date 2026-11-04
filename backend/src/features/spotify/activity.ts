import { eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.ts'
import { spotifyLinks, users } from '../../db/schema.ts'
import { isOnline, onlineUserIds, send, setActivity } from '../../lib/realtime.ts'
import { spotifyApi } from './client.ts'
import { playbackSignature, toPlayback, worthSending, type ApiPlayer, type Playback, type Sent } from './playback.ts'

// Two things come out of one question to Spotify: "Listening to Spotify" on a friend's name, like
// Discord, and the now-playing bar in the person's own player. Spotify has no way to tell us when a
// song changes, so the server asks and pushes what changed down the WebSocket.
//
// The tabs used to ask for themselves, every four seconds each — ~900 requests an hour per open tab,
// which on a metered free plan was most of the month's bandwidth. Asking here costs one message per
// change instead, but a plain slow heartbeat would make the buttons feel dead, so the asking is
// pointed at the moments something actually changes:
//
//   · the heartbeat below, for changes made somewhere else (their phone, the desktop app)
//   · `nudge`, a moment after they press one of our own buttons
//   · a check timed to land just after the current track is due to end
//
// Between those, the tab works the position out from the clock, and only a real drift is corrected.

/** The unprompted heartbeat. Everything that is prompted is handled faster, below. */
const EVERY_MS = 10_000
/** Spotify calls in flight at once. Its API answers a burst from one app with 429s. */
const AT_ONCE = 5

/**
 * How long after a button press to look again. Spotify applies a command and reports the result a
 * moment later, and how long varies — "next" in particular often still reports the old track at
 * 400ms. Three tries cover it; each one sends nothing if nothing has changed.
 */
const NUDGE_MS = [400, 1400, 3200]

/**
 * How far the position may be from where the tab will have carried it before a correction is worth
 * sending. The tab ticks along on its own clock, which stays accurate, so this is rarely hit — but
 * it has to be well under a line of a song, because time-synced lyrics are drawn from this
 * position and a second out is visible.
 */
const DRIFT_MS = 1000

/** What was last pushed to each person, so an unchanged song sends nothing. */
const sent = new Map<string, Sent>()
/** A check booked for the moment a track runs out, one per person. */
const endOfTrack = new Map<string, NodeJS.Timeout>()

type Person = { id: string; status: string; shareActivity: boolean }
let server: FastifyInstance | null = null

/** Runs `work` over `items`, no more than `limit` at a time. */
async function mapLimit<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await work(items[next++])
  })
  await Promise.all(runners)
}

/**
 * Sends this person's playback to their open tabs, unless it is the same song still ticking along
 * where the tab already believes it to be. `null` means nothing is playing, worth sending once.
 */
function pushPlayback(userId: string, playback: Playback | null) {
  const now = Date.now()
  if (!worthSending(sent.get(userId), playback, now, DRIFT_MS)) return
  sent.set(userId, { signature: playbackSignature(playback), progressMs: playback?.progressMs ?? 0, at: now })
  send(userId, { channel: 'spotify', event: { type: 'playback', playback } })
}

/**
 * Books a look at the moment the current track runs out, when that falls before the next heartbeat.
 * Without it a song ending is only noticed on the next sweep, so the player would sit on a finished
 * track for up to ten seconds — the one stale moment people notice most, because they can hear it.
 */
function checkWhenTrackEnds(userId: string, playback: Playback | null) {
  clearTimeout(endOfTrack.get(userId))
  endOfTrack.delete(userId)
  if (!playback?.isPlaying) return
  const left = playback.track.durationMs - playback.progressMs
  if (left <= 0 || left > EVERY_MS) return
  // a little past the end, so Spotify has the next track ready to report
  const timer = setTimeout(() => void lookAt(userId).catch(() => {}), left + 700)
  timer.unref()
  endOfTrack.set(userId, timer)
}

/** Asks Spotify about one person, then tells their tabs and their friends whatever changed. */
async function poll(person: Person) {
  let playback: Playback | null
  try {
    playback = toPlayback((await spotifyApi(person.id, '/me/player')) as ApiPlayer | null)
  } catch (e) {
    server?.log.debug({ err: e }, 'Spotify poll failed')
    // Only a link that has actually gone means they've stopped listening. A rate limit or a bad
    // minute at Spotify's end says nothing about what is playing, so leave the song where it is and
    // ask again next time — clearing it would blink the player and the label off and on again.
    if ((e as { code?: string }).code === 'spotify-unlinked') {
      sent.delete(person.id)
      await setActivity(person.id, null)
    }
    return
  }

  // their own player, which is the whole reason this runs for people nobody can see
  pushPlayback(person.id, playback)
  checkWhenTrackEnds(person.id, playback)

  // and the label on their name: not while paused, not if they've turned sharing off, and not while
  // they're appearing offline
  const visible = person.shareActivity && person.status !== 'offline'
  const showing = playback?.isPlaying && visible ? playback : null
  await setActivity(person.id, showing ? { kind: 'spotify', track: showing.track.title, artist: showing.track.artists } : null)
}

/** One person, looked up and asked about — for the booked checks, which have only an id to go on. */
async function lookAt(userId: string) {
  if (!server || !isOnline(userId)) return
  const [person] = await db
    .select({ id: users.id, status: users.status, shareActivity: users.shareActivity })
    .from(users)
    .where(eq(users.id, userId))
  if (person) await poll(person)
}

/**
 * Called when this person presses play, pause, next, previous, seek or repeat here. The command has
 * already gone to Spotify; this is what makes the answer come back without waiting for a heartbeat,
 * and it reaches every tab they have open, not just the one that was pressed.
 */
export function nudge(userId: string) {
  if (!server) return
  for (const delay of NUDGE_MS) {
    const timer = setTimeout(() => void lookAt(userId).catch(() => {}), delay)
    timer.unref()
  }
}

/**
 * One pass over everyone with an open tab. Two queries for the whole sweep, whatever the number of
 * people — it used to be two per person, which at fifty online was a query every few milliseconds
 * against a database that bills by the time it spends awake.
 */
async function sweep() {
  const online = onlineUserIds()
  for (const id of [...sent.keys()]) {
    if (online.includes(id)) continue
    sent.delete(id)
    clearTimeout(endOfTrack.get(id))
    endOfTrack.delete(id)
  }
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
   * friends see that is held back, in `poll`.
   */
  await mapLimit(people.filter((p) => linked.has(p.id)), AT_ONCE, poll)
}

export function startActivityPolling(app: FastifyInstance) {
  server = app
  const timer = setInterval(() => void sweep().catch((e) => app.log.debug({ err: e }, 'activity sweep')), EVERY_MS)
  timer.unref()
  return () => {
    clearInterval(timer)
    for (const t of endOfTrack.values()) clearTimeout(t)
    endOfTrack.clear()
    server = null
  }
}
