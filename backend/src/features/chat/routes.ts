import { and, asc, eq, gt, not, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../db/client.ts'
import { conversationMembers, conversations, friendships, messageAttachments, messageHides, messages } from '../../db/schema.ts'
import { HttpError, parse } from '../../lib/errors.ts'
import { send } from '../../lib/realtime.ts'
import { requireAuth, userOf } from '../../lib/session.ts'
import { readMultipart, saveMedia, type StoredMedia } from '../../lib/uploads.ts'
import { listConversations, memberOrFail, oneConversation, otherMembers, pushMessage, shapeMessages } from './service.ts'

// Direct messages. Text and photos go through here (so there's history, search and unread counts);
// voice and video calls go device-to-device, see features/calls.

const Open = z.object({ userId: z.uuid('That person could not be found.') })
const Settings = z.strictObject({
  nickname: z.string().trim().max(32).optional(),
  color: z.string().max(20).optional(),
  background: z.string().max(20).optional(),
})
const Forward = z.object({ conversationId: z.uuid() })
const Text = z.string().trim().max(4000, 'That message is too long.')

/** The pair key makes sure two people only ever have one direct conversation. */
const dmKey = (a: string, b: string) => [a, b].sort().join(':')

export default async function chatRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  app.get('/conversations', async (req) => ({ conversations: await listConversations(userOf(req).id) }))

  /** Opens the conversation with a friend, starting it the first time. */
  app.post('/conversations', async (req) => {
    const me = userOf(req).id
    const { userId } = parse(Open, req.body)
    if (userId === me) throw new HttpError(400, 'invalid', 'You can’t message yourself.')
    const friend = await db.query.friendships.findFirst({ where: and(eq(friendships.userId, me), eq(friendships.friendId, userId)) })
    if (!friend) throw new HttpError(403, 'not-friends', 'Add them as a friend first.')

    const key = dmKey(me, userId)
    const existing = await db.query.conversations.findFirst({ where: eq(conversations.dmKey, key) })
    if (existing) {
      // reopening one you'd deleted brings it back, without the messages you cleared
      await db.update(conversationMembers).set({ hidden: false }).where(and(eq(conversationMembers.conversationId, existing.id), eq(conversationMembers.userId, me)))
      return oneConversation(me, existing.id)
    }
    const id = await db.transaction(async (tx) => {
      const [conversation] = await tx.insert(conversations).values({ dmKey: key }).returning()
      await tx.insert(conversationMembers).values([{ conversationId: conversation.id, userId: me }, { conversationId: conversation.id, userId }])
      return conversation.id
    })
    const conversation = await oneConversation(me, id)
    const [theirs] = await listConversations(userId, id)
    if (theirs) send(userId, { channel: 'chat', event: { type: 'conversation', conversation: theirs } })
    return conversation
  })

  app.get('/conversations/:id/messages', async (req) => {
    const me = userOf(req).id
    const { id } = req.params as { id: string }
    const member = await memberOrFail(id, me)
    const [otherId] = await otherMembers(id, me)
    const other = otherId ? await db.query.conversationMembers.findFirst({ where: and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, otherId)) }) : undefined

    const rows = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, id),
          member.clearedAt ? gt(messages.createdAt, member.clearedAt) : undefined,
          not(sql`exists (select 1 from ${messageHides} h where h.message_id = ${messages.id} and h.user_id = ${me})`),
        ),
      )
      .orderBy(asc(messages.createdAt))
      .limit(500)
    return { messages: await shapeMessages(rows, me, { otherId, otherReadAt: other?.lastReadAt }) }
  })

  /** multipart/form-data: a `text` field, `files` for photos and videos, or both. */
  app.post('/conversations/:id/messages', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const me = userOf(req).id
    const { id } = req.params as { id: string }
    await memberOrFail(id, me)
    const { fields, files } = await readMultipart(req as never)
    const text = parse(Text.optional(), fields.text || undefined)
    if (!text && !files.length) throw new HttpError(400, 'empty', 'Write something or add a photo.')

    const stored: StoredMedia[] = []
    for (const f of files) stored.push(await saveMedia(f.data, f.filename, f.mimetype))

    const message = await db.transaction(async (tx) => {
      const [row] = await tx.insert(messages).values({ conversationId: id, senderId: me, text: text || null }).returning()
      if (stored.length) {
        await tx.insert(messageAttachments).values(stored.map((s, i) => ({ messageId: row.id, kind: s.kind, file: s.file, name: s.name, width: s.width, height: s.height, position: i })))
      }
      await tx.update(conversations).set({ lastActivityAt: row.createdAt }).where(eq(conversations.id, id))
      // a message brings the conversation back for anyone who had deleted it, and counts as read for the sender
      await tx.update(conversationMembers).set({ hidden: false }).where(eq(conversationMembers.conversationId, id))
      await tx.update(conversationMembers).set({ lastReadAt: row.createdAt }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, me)))
      return row
    })

    const [shaped] = await shapeMessages([message], me, {})
    void pushMessage(id, message, me)
    return shaped
  })

  /** Sends a copy of a message to another conversation. */
  app.post('/messages/:id/forward', async (req) => {
    const me = userOf(req).id
    const { id } = req.params as { id: string }
    const { conversationId } = parse(Forward, req.body)
    await memberOrFail(conversationId, me)

    const original = await db.query.messages.findFirst({ where: eq(messages.id, id) })
    if (!original) throw new HttpError(404, 'no-message', 'That message is no longer there.')
    await memberOrFail(original.conversationId, me) // you can only pass on what you can see
    const files = await db.select().from(messageAttachments).where(eq(messageAttachments.messageId, id)).orderBy(asc(messageAttachments.position))

    const copy = await db.transaction(async (tx) => {
      const [row] = await tx.insert(messages).values({ conversationId, senderId: me, text: original.text, forwarded: true }).returning()
      if (files.length) {
        // the copy points at the same stored files; neither is deleted while the other needs it
        await tx.insert(messageAttachments).values(files.map((f, i) => ({ messageId: row.id, kind: f.kind, file: f.file, name: f.name, width: f.width, height: f.height, position: i })))
      }
      await tx.update(conversations).set({ lastActivityAt: row.createdAt }).where(eq(conversations.id, conversationId))
      await tx.update(conversationMembers).set({ hidden: false }).where(eq(conversationMembers.conversationId, conversationId))
      return row
    })

    const [shaped] = await shapeMessages([copy], me, {})
    void pushMessage(conversationId, copy, me)
    return shaped
  })

  /** `forEveryone` unsends your own message; otherwise it just goes from your view. */
  app.delete('/messages/:id', async (req, reply) => {
    const me = userOf(req).id
    const { id } = req.params as { id: string }
    const forEveryone = (req.query as { forEveryone?: string }).forEveryone === 'true'
    const message = await db.query.messages.findFirst({ where: eq(messages.id, id) })
    if (!message) return reply.code(204).send()
    await memberOrFail(message.conversationId, me)

    if (forEveryone) {
      if (message.senderId !== me) throw new HttpError(403, 'not-yours', 'You can only unsend your own messages.')
      await db.delete(messages).where(eq(messages.id, id))
      const everyone = [me, ...(await otherMembers(message.conversationId, me))]
      for (const userId of everyone) send(userId, { channel: 'chat', event: { type: 'message-deleted', conversationId: message.conversationId, messageId: id } })
    } else {
      await db.insert(messageHides).values({ messageId: id, userId: me }).onConflictDoNothing()
      send(me, { channel: 'chat', event: { type: 'message-deleted', conversationId: message.conversationId, messageId: id } })
    }
    return reply.code(204).send()
  })

  app.post('/conversations/:id/read', async (req, reply) => {
    const me = userOf(req).id
    const { id } = req.params as { id: string }
    await memberOrFail(id, me)
    const at = new Date()
    await db.update(conversationMembers).set({ lastReadAt: at }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, me)))
    const [conversation] = await listConversations(me, id)
    if (conversation) send(me, { channel: 'chat', event: { type: 'conversation', conversation } })
    // the other side's "Seen"
    for (const userId of await otherMembers(id, me)) send(userId, { channel: 'chat', event: { type: 'read', conversationId: id, userId: me, at: at.toISOString() } })
    return reply.code(204).send()
  })

  /** Nickname, chat colour and background: only you see yours. */
  app.patch('/conversations/:id', async (req) => {
    const me = userOf(req).id
    const { id } = req.params as { id: string }
    await memberOrFail(id, me)
    const patch = parse(Settings, req.body)
    await db
      .update(conversationMembers)
      .set({ ...(patch.nickname !== undefined ? { nickname: patch.nickname || null } : {}), color: patch.color, background: patch.background })
      .where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, me)))
    return oneConversation(me, id)
  })

  /** "Delete conversation": gone from your list with its messages; the other person keeps theirs. */
  app.delete('/conversations/:id', async (req, reply) => {
    const me = userOf(req).id
    const { id } = req.params as { id: string }
    await memberOrFail(id, me)
    await db.update(conversationMembers).set({ hidden: true, clearedAt: new Date() }).where(and(eq(conversationMembers.conversationId, id), eq(conversationMembers.userId, me)))
    send(me, { channel: 'chat', event: { type: 'conversation-deleted', conversationId: id } })

    // nobody has it in their list any more: remove it and its files for good
    const left = await db.query.conversationMembers.findFirst({ where: and(eq(conversationMembers.conversationId, id), eq(conversationMembers.hidden, false)) })
    if (!left) await db.delete(conversations).where(eq(conversations.id, id))
    return reply.code(204).send()
  })
}
