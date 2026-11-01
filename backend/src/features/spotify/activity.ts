import { eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.ts'
import { spotifyLinks, users } from '../../db/schema.ts'
import { friendIdsOf, isOnline, onlineUserIds, setActivity } from '../../lib/realtime.ts'
import { spotifyApi } from './client.ts'

// "Listening to Spotify" on a friend's name, like Discord. Spotify has no way to tell us when a song
// changes, so the server asks every few seconds — but only for people who are online, share their
// activity, and have at least one friend online to show it to.

const EVERY_MS = 8_000

type Player = { is_playing: boolean; item: { type: string; name: string; artists?: { name: string }[] } | null }

async function sweep(app: FastifyInstance) {
  const online = onlineUserIds()
  if (!online.length) return
  const rows = await db.query.users.findMany({ where: inArray(users.id, online) })
  for (const user of rows) {
    if (!user.shareActivity || user.status === 'offline') {
      await setActivity(user.id, null)
      continue
    }
    const friends = await friendIdsOf(user.id)
    if (!friends.some(isOnline)) continue // nobody around to see it
    const link = await db.query.spotifyLinks.findFirst({ where: eq(spotifyLinks.userId, user.id) })
    if (!link) continue
    try {
      const player = (await spotifyApi(user.id, '/me/player')) as Player | null
      const track = player?.is_playing && player.item?.type === 'track' ? player.item : null
      await setActivity(user.id, track ? { kind: 'spotify', track: track.name, artist: (track.artists ?? []).map((a) => a.name).join(', ') } : null)
    } catch (e) {
      app.log.debug({ err: e }, 'Spotify activity poll failed')
      await setActivity(user.id, null)
    }
  }
}

export function startActivityPolling(app: FastifyInstance) {
  const timer = setInterval(() => void sweep(app).catch((e) => app.log.debug({ err: e }, 'activity sweep')), EVERY_MS)
  timer.unref()
  return () => clearInterval(timer)
}
