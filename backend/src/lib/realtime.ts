import websocket from '@fastify/websocket'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { WebSocket } from 'ws'
import { db } from '../db/client.ts'
import { friendships, users, type UserRow } from '../db/schema.ts'
import { publicUser, type Activity } from '../features/auth/users.ts'
import { chooseProtocol, requireAuth, userOf } from './session.ts'

/**
 * One WebSocket per open tab, at /api/ws, for everything that arrives without being asked for:
 * new messages, presence, friend requests, posts you've been tagged in, and call signalling.
 * Each message is { channel, ... }; the browser ignores channels it doesn't know.
 */
export type Push = { channel: 'chat' | 'memories' | 'friends' | 'call'; [key: string]: unknown }

const sockets = new Map<string, Set<WebSocket>>()
const activities = new Map<string, Activity | null>()
type Handler = (userId: string, msg: Record<string, unknown>, app: FastifyInstance) => void
const handlers = new Map<string, Handler>()
const onGone: ((userId: string) => void)[] = []

/** Called when someone's last tab closes (used to hang up their calls). */
export const onDisconnect = (fn: (userId: string) => void) => onGone.push(fn)

export const isOnline = (userId: string) => (sockets.get(userId)?.size ?? 0) > 0
export const onlineUserIds = () => [...sockets.keys()]

export function send(userId: string, push: Push) {
  const data = JSON.stringify(push)
  for (const socket of sockets.get(userId) ?? []) if (socket.readyState === socket.OPEN) socket.send(data)
}

export function sendToAll(userIds: Iterable<string>, push: Push) {
  for (const id of new Set(userIds)) send(id, push)
}

/** Handles one kind of message from the browser, e.g. 'call:invite'. */
export const onPush = (type: string, handler: Handler) => handlers.set(type, handler)

export const friendIdsOf = async (userId: string) =>
  (await db.select({ id: friendships.friendId }).from(friendships).where(eq(friendships.userId, userId))).map((r) => r.id)

/**
 * What friends see: the status the person chose while they have the app open, otherwise offline.
 * Choosing "Inactive" is Discord's invisible: they look offline but still get everything.
 */
export function presenceOf(user: Pick<UserRow, 'id' | 'status' | 'shareActivity'>) {
  const online = isOnline(user.id) && user.status !== 'offline'
  return {
    status: online ? user.status : ('offline' as const),
    activity: online && user.shareActivity ? (activities.get(user.id) ?? undefined) : undefined,
  }
}

/** Tells this person's friends how they look now (status, and what they're playing). */
export async function announcePresence(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user) return
  const friends = await friendIdsOf(userId)
  if (friends.length) sendToAll(friends, { channel: 'chat', event: { type: 'presence', user: publicUser(user, presenceOf(user)) } })
}

/** Remembers what someone is playing (from the Spotify poller) and tells their friends when it changes. */
export async function setActivity(userId: string, activity: Activity | null) {
  const before = activities.get(userId)
  if (before?.track === activity?.track && before?.artist === activity?.artist) return
  activities.set(userId, activity)
  await announcePresence(userId)
}

export const clearActivity = (userId: string) => activities.delete(userId)

export async function registerRealtime(app: FastifyInstance) {
  // handleProtocols must answer with one the browser offered, or it hangs up
  await app.register(websocket, { options: { maxPayload: 16 * 1024, handleProtocols: chooseProtocol } })

  app.get('/api/ws', { websocket: true, preHandler: requireAuth }, (socket, req) => {
    const user = userOf(req)
    const mine = sockets.get(user.id) ?? new Set()
    mine.add(socket)
    sockets.set(user.id, mine)
    if (mine.size === 1) void announcePresence(user.id) // their first open tab: they're online now

    // the browser is told who else is around; it asks for everything else over HTTP
    void friendIdsOf(user.id).then(async (friends) => {
      const rows = friends.length ? await db.query.users.findMany({ where: (u, { inArray }) => inArray(u.id, friends) }) : []
      socket.send(JSON.stringify({ channel: 'chat', event: { type: 'hello', friends: rows.map((f) => publicUser(f, presenceOf(f))) } }))
    })

    let alive = true
    socket.on('pong', () => {
      alive = true
    })
    const beat = setInterval(() => {
      if (!alive) return socket.terminate() // the tab went away without saying goodbye
      alive = false
      socket.ping()
    }, 30_000)

    socket.on('message', (raw: Buffer) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw.toString())
      } catch {
        return
      }
      const handler = typeof msg.type === 'string' ? handlers.get(msg.type) : undefined
      handler?.(user.id, msg, app)
    })

    socket.on('close', () => {
      clearInterval(beat)
      mine.delete(socket)
      if (!mine.size) {
        sockets.delete(user.id)
        activities.delete(user.id)
        for (const fn of onGone) fn(user.id)
        void announcePresence(user.id) // last tab closed: they're offline
      }
    })
  })
}
