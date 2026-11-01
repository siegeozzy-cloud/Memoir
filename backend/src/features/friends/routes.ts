import { and, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../db/client.ts'
import { friendRequests, friendships, users } from '../../db/schema.ts'
import { HttpError, parse } from '../../lib/errors.ts'
import { friendIdsOf, presenceOf, send } from '../../lib/realtime.ts'
import { requireAuth, userOf } from '../../lib/session.ts'
import { avatarUrl, publicUser } from '../auth/users.ts'

// Friends: find someone by name or unique ID, ask to be friends, accept or decline.
// You can only message people who have accepted.

const Target = z.object({ userId: z.uuid('That person could not be found.') })
const Query = z.object({ q: z.string().trim().max(60).default('') })

/** "mmr7k2q9xa4", "MMR-7K2Q-9XA4" and "7k2q 9xa4" all mean the same ID. */
function asUniqueId(q: string) {
  const bare = q.replace(/[\s-]/g, '').toUpperCase()
  const body = bare.startsWith('MMR') ? bare.slice(3) : bare
  return /^[A-HJ-NP-Z2-9]{8}$/.test(body) ? `MMR-${body.slice(0, 4)}-${body.slice(4)}` : null
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Tells people their friends list changed, so their open tabs reload it. */
const nudge = (...userIds: string[]) => userIds.forEach((id) => send(id, { channel: 'friends' }))

/** The pop-up for a new friend request, unless they've turned those off or asked not to be disturbed. */
async function notifyRequest(toUserId: string, from: { id: string; name: string; avatarFile: string | null }) {
  const to = await db.query.users.findFirst({ where: eq(users.id, toUserId) })
  if (!to?.notifyFriendRequests || to.status === 'dnd') return
  send(toUserId, {
    channel: 'friends',
    event: {
      type: 'notification',
      from: { id: from.id, name: from.name, avatarUrl: avatarUrl(from.avatarFile) },
      message: 'Sent you a friend request',
    },
  })
}

export default async function friendRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  /** Everyone you're friends with, as they look right now. */
  app.get('/', async (req) => {
    const ids = await friendIdsOf(userOf(req).id)
    if (!ids.length) return { friends: [] }
    const rows = await db.query.users.findMany({ where: inArray(users.id, ids) })
    return { friends: rows.map((u) => publicUser(u, presenceOf(u))) }
  })

  /** Requests waiting for you, and the ones you've sent. */
  app.get('/requests', async (req) => {
    const me = userOf(req).id
    const rows = await db
      .select({ id: friendRequests.id, fromUserId: friendRequests.fromUserId, toUserId: friendRequests.toUserId, createdAt: friendRequests.createdAt, user: users })
      .from(friendRequests)
      .innerJoin(users, eq(users.id, sql`case when ${friendRequests.fromUserId} = ${me} then ${friendRequests.toUserId} else ${friendRequests.fromUserId} end`))
      .where(or(eq(friendRequests.fromUserId, me), eq(friendRequests.toUserId, me)))
    return {
      incoming: rows.filter((r) => r.toUserId === me).map((r) => ({ id: r.id, user: publicUser(r.user, presenceOf(r.user)), at: r.createdAt })),
      outgoing: rows.filter((r) => r.fromUserId === me).map((r) => ({ id: r.id, user: publicUser(r.user), at: r.createdAt })),
    }
  })

  /**
   * Find people to add, by unique ID (exact) or by name. Each result says how you stand with them,
   * so the UI can offer Add, Cancel, Accept, or nothing.
   */
  app.get('/search', async (req) => {
    const { q } = parse(Query, req.query)
    const me = userOf(req).id
    if (q.length < 2) return { results: [] }
    // an ID is matched exactly; anything else (and an ID-shaped name) is matched by name as well
    const uniqueId = asUniqueId(q) ?? q.toUpperCase()
    const rows = await db.query.users.findMany({
      where: and(ne(users.id, me), or(ilike(users.name, `%${escapeLike(q)}%`), eq(users.uniqueId, uniqueId))),
      limit: 8,
    })
    if (!rows.length) return { results: [] }

    const ids = rows.map((r) => r.id)
    const friends = new Set((await db.select({ id: friendships.friendId }).from(friendships).where(and(eq(friendships.userId, me), inArray(friendships.friendId, ids)))).map((r) => r.id))
    const pending = await db
      .select({ fromUserId: friendRequests.fromUserId, toUserId: friendRequests.toUserId })
      .from(friendRequests)
      .where(or(and(eq(friendRequests.fromUserId, me), inArray(friendRequests.toUserId, ids)), and(eq(friendRequests.toUserId, me), inArray(friendRequests.fromUserId, ids))))
    const sent = new Set(pending.filter((p) => p.fromUserId === me).map((p) => p.toUserId))
    const received = new Set(pending.filter((p) => p.toUserId === me).map((p) => p.fromUserId))

    return {
      results: rows.map((u) => ({
        user: publicUser(u, friends.has(u.id) ? presenceOf(u) : {}),
        // their ID is only shown back when it's exactly what was searched for, so names can't be used to harvest IDs
        uniqueId: u.uniqueId === uniqueId ? u.uniqueId : undefined,
        relation: friends.has(u.id) ? 'friend' : sent.has(u.id) ? 'sent' : received.has(u.id) ? 'received' : 'none',
      })),
    }
  })

  /** Ask to be friends. If they already asked you, this accepts instead. */
  app.post('/requests', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const me = userOf(req).id
    const { userId } = parse(Target, req.body)
    if (userId === me) throw new HttpError(400, 'invalid', 'You can’t add yourself.')
    const them = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!them || them.deactivatedAt) throw new HttpError(404, 'no-user', 'That person could not be found.')

    const already = await db.query.friendships.findFirst({ where: and(eq(friendships.userId, me), eq(friendships.friendId, userId)) })
    if (already) return { status: 'friend' as const }

    const theirs = await db.query.friendRequests.findFirst({ where: and(eq(friendRequests.fromUserId, userId), eq(friendRequests.toUserId, me)) })
    if (theirs) {
      await becomeFriends(me, userId)
      nudge(me, userId)
      return { status: 'friend' as const }
    }
    await db.insert(friendRequests).values({ fromUserId: me, toUserId: userId }).onConflictDoNothing()
    nudge(userId)
    void notifyRequest(userId, userOf(req))
    return reply.code(202).send({ status: 'sent' })
  })

  /** Accept a request someone sent you. */
  app.post('/requests/:id/accept', async (req) => {
    const me = userOf(req).id
    const request = await db.query.friendRequests.findFirst({ where: eq(friendRequests.id, (req.params as { id: string }).id) })
    if (!request || request.toUserId !== me) throw new HttpError(404, 'no-request', 'That request is no longer there.')
    await becomeFriends(me, request.fromUserId)
    nudge(me, request.fromUserId)
    return { status: 'friend' as const }
  })

  /** Decline one sent to you, or cancel one you sent. */
  app.delete('/requests/:id', async (req, reply) => {
    const me = userOf(req).id
    const request = await db.query.friendRequests.findFirst({ where: eq(friendRequests.id, (req.params as { id: string }).id) })
    if (!request || (request.toUserId !== me && request.fromUserId !== me)) throw new HttpError(404, 'no-request', 'That request is no longer there.')
    await db.delete(friendRequests).where(eq(friendRequests.id, request.id))
    nudge(me, request.fromUserId === me ? request.toUserId : request.fromUserId)
    return reply.code(204).send()
  })

  /** Stop being friends, both ways. Conversations and their messages stay. */
  app.delete('/:userId', async (req, reply) => {
    const me = userOf(req).id
    const { userId } = req.params as { userId: string }
    await db.delete(friendships).where(or(and(eq(friendships.userId, me), eq(friendships.friendId, userId)), and(eq(friendships.userId, userId), eq(friendships.friendId, me))))
    nudge(me, userId)
    return reply.code(204).send()
  })
}

async function becomeFriends(a: string, b: string) {
  await db.transaction(async (tx) => {
    await tx.delete(friendRequests).where(or(and(eq(friendRequests.fromUserId, a), eq(friendRequests.toUserId, b)), and(eq(friendRequests.fromUserId, b), eq(friendRequests.toUserId, a))))
    await tx.insert(friendships).values([{ userId: a, friendId: b }, { userId: b, friendId: a }]).onConflictDoNothing()
  })
}
