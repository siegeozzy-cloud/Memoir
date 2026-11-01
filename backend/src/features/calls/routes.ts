import { createHmac } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { config } from '../../config.ts'
import { db } from '../../db/client.ts'
import { friendships, users } from '../../db/schema.ts'
import { isOnline, onPush, send } from '../../lib/realtime.ts'
import { requireAuth } from '../../lib/session.ts'
import { publicUser } from '../auth/users.ts'

/**
 * Voice and video calls. The picture and sound go straight between the two devices (WebRTC); the server
 * only passes the setup messages along and hands out the addresses of the STUN and TURN servers.
 *
 * STUN tells a device how it looks from the outside, which is usually enough to find a direct path.
 * When a network won't allow one, TURN relays the call instead: coturn (docker-compose.yml) checks a
 * username/password pair that this server works out from a shared secret, so it needs no accounts.
 */

const RING_MS = 45_000

type Call = { id: string; callerId: string; calleeId: string; kind: 'voice' | 'video'; timer?: NodeJS.Timeout }
const calls = new Map<string, Call>()

const callOf = (userId: string) => [...calls.values()].find((c) => c.callerId === userId || c.calleeId === userId)
const otherSide = (call: Call, userId: string) => (call.callerId === userId ? call.calleeId : call.callerId)

function endCall(call: Call, by: string, reason: string) {
  clearTimeout(call.timer)
  calls.delete(call.id)
  for (const userId of [call.callerId, call.calleeId]) {
    if (userId !== by) send(userId, { channel: 'call', type: 'call:ended', callId: call.id, reason })
  }
  send(by, { channel: 'call', type: 'call:ended', callId: call.id, reason })
}

/** Short-lived credentials for coturn's shared-secret mode: the username carries its own expiry. */
function turnCredentials() {
  if (!config.turnConfigured) return null
  const username = `${Math.floor(Date.now() / 1000) + config.TURN_TTL}:memoir`
  const credential = createHmac('sha1', config.TURN_SECRET!).update(username).digest('base64')
  return { urls: config.TURN_URL!, username, credential }
}

export default async function callRoutes(app: FastifyInstance) {
  app.get('/ice', { preHandler: requireAuth }, async () => {
    const turn = turnCredentials()
    return { iceServers: [{ urls: config.stunUrls }, ...(turn ? [turn] : [])], turnConfigured: config.turnConfigured }
  })
}

/** The call messages a browser can send over the WebSocket. */
export function registerCallSignalling() {
  onPush('call:invite', async (meId, msg) => {
    const to = String(msg.to ?? '')
    const kind = msg.kind === 'video' ? 'video' : 'voice'
    const friend = await db.query.friendships.findFirst({ where: and(eq(friendships.userId, meId), eq(friendships.friendId, to)) })
    if (!friend) return send(meId, { channel: 'call', type: 'call:failed', reason: 'not-friends' })
    if (callOf(meId)) return send(meId, { channel: 'call', type: 'call:failed', reason: 'busy' })
    if (!isOnline(to)) return send(meId, { channel: 'call', type: 'call:failed', reason: 'offline' })
    if (callOf(to)) return send(meId, { channel: 'call', type: 'call:failed', reason: 'their-line-busy' })
    const them = await db.query.users.findFirst({ where: eq(users.id, to) })
    const me = await db.query.users.findFirst({ where: eq(users.id, meId) })
    if (!them || !me) return
    if (them.status === 'dnd') return send(meId, { channel: 'call', type: 'call:failed', reason: 'do-not-disturb' })

    const call: Call = { id: crypto.randomUUID(), callerId: meId, calleeId: to, kind }
    call.timer = setTimeout(() => endCall(call, meId, 'no-answer'), RING_MS)
    calls.set(call.id, call)
    send(to, { channel: 'call', type: 'call:incoming', callId: call.id, kind, from: publicUser(me) })
    send(meId, { channel: 'call', type: 'call:ringing', callId: call.id, kind, with: publicUser(them) })
  })

  onPush('call:accept', (meId, msg) => {
    const call = calls.get(String(msg.callId))
    if (!call || call.calleeId !== meId) return
    clearTimeout(call.timer)
    // the caller makes the offer once the callee has picked up
    send(call.callerId, { channel: 'call', type: 'call:accepted', callId: call.id })
  })

  onPush('call:decline', (meId, msg) => {
    const call = calls.get(String(msg.callId))
    if (call && (call.calleeId === meId || call.callerId === meId)) endCall(call, meId, 'declined')
  })

  onPush('call:end', (meId, msg) => {
    const call = calls.get(String(msg.callId))
    if (call && (call.calleeId === meId || call.callerId === meId)) endCall(call, meId, 'ended')
  })

  /** Passes the connection details (offer, answer, candidates) to the other side, unread. */
  onPush('call:signal', (meId, msg) => {
    const call = calls.get(String(msg.callId))
    if (!call || (call.callerId !== meId && call.calleeId !== meId)) return
    send(otherSide(call, meId), { channel: 'call', type: 'call:signal', callId: call.id, data: msg.data })
  })
}

/** Ends a call when one side's last tab closes. */
export function dropCallsOf(userId: string) {
  const call = callOf(userId)
  if (call) endCall(call, userId, 'ended')
}
