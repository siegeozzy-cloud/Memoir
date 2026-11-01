import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { conversationMembers, conversations, messageAttachments, messages, users } from '../../db/schema.ts'
import { HttpError } from '../../lib/errors.ts'
import { isOnline, send, type Push } from '../../lib/realtime.ts'
import { mediaUrl } from '../../lib/uploads.ts'
import { avatarUrl } from '../auth/users.ts'

// Shapes the rows into what the web app's chat expects (features/chat/types.ts), and keeps
// everyone's open tabs in step.

export type ApiConversation = {
  id: string
  participantIds: string[]
  unread: number
  lastActivityAt: string
  settings: { nickname?: string; color: string; background: string }
}

export type ApiMessage = {
  id: string
  conversationId: string
  senderId: string
  createdAt: string
  text?: string
  attachments: { id: string; kind: 'image' | 'video'; url: string; name: string; width?: number; height?: number }[]
  status: 'sent' | 'delivered' | 'read'
  forwarded?: boolean
}

/** The other people in a conversation (direct messages: one person). */
export async function otherMembers(conversationId: string, meId: string) {
  const rows = await db.select({ userId: conversationMembers.userId }).from(conversationMembers).where(eq(conversationMembers.conversationId, conversationId))
  return rows.map((r) => r.userId).filter((id) => id !== meId)
}

/** Throws unless this person is in the conversation. */
export async function memberOrFail(conversationId: string, userId: string) {
  const member = await db.query.conversationMembers.findFirst({ where: and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)) })
  if (!member) throw new HttpError(404, 'no-conversation', 'That conversation isn’t there.')
  return member
}

/** Conversations in this person's list (the ones they haven't deleted), newest activity first. */
export async function listConversations(meId: string, onlyId?: string): Promise<ApiConversation[]> {
  const rows = await db.execute<{
    id: string
    last_activity_at: Date
    nickname: string | null
    color: string
    background: string
    unread: string
    participants: string[]
  }>(sql`
    select c.id, c.last_activity_at, m.nickname, m.color, m.background,
      (select count(*) from ${messages} msg
         where msg.conversation_id = c.id and msg.sender_id <> ${meId}
           and msg.created_at > m.last_read_at
           and (m.cleared_at is null or msg.created_at > m.cleared_at)
           and not exists (select 1 from message_hides h where h.message_id = msg.id and h.user_id = ${meId})) as unread,
      (select array_agg(mm.user_id) from ${conversationMembers} mm where mm.conversation_id = c.id) as participants
    from ${conversations} c
    join ${conversationMembers} m on m.conversation_id = c.id and m.user_id = ${meId}
    where m.hidden = false ${onlyId ? sql`and c.id = ${onlyId}` : sql``}
    order by c.last_activity_at desc
    limit 200`)

  return rows.rows.map((r) => ({
    id: r.id,
    participantIds: r.participants ?? [],
    unread: Number(r.unread),
    lastActivityAt: new Date(r.last_activity_at).toISOString(),
    settings: { ...(r.nickname ? { nickname: r.nickname } : {}), color: r.color, background: r.background },
  }))
}

export async function oneConversation(meId: string, id: string) {
  const [conversation] = await listConversations(meId, id)
  if (!conversation) throw new HttpError(404, 'no-conversation', 'That conversation isn’t there.')
  return conversation
}

type MessageRow = typeof messages.$inferSelect

/** Fills in attachments and, for the reader's own messages, whether they've been delivered or seen. */
export async function shapeMessages(rows: MessageRow[], meId: string, readerSees: { otherId?: string; otherReadAt?: Date | null }): Promise<ApiMessage[]> {
  if (!rows.length) return []
  const files = await db.select().from(messageAttachments).where(inArray(messageAttachments.messageId, rows.map((r) => r.id))).orderBy(asc(messageAttachments.position))
  const byMessage = new Map<string, typeof files>()
  for (const f of files) byMessage.set(f.messageId, [...(byMessage.get(f.messageId) ?? []), f])

  const otherOnline = readerSees.otherId ? isOnline(readerSees.otherId) : false
  return rows.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    senderId: m.senderId,
    createdAt: m.createdAt.toISOString(),
    ...(m.text ? { text: m.text } : {}),
    attachments: (byMessage.get(m.id) ?? []).map((f) => ({
      id: f.id,
      kind: f.kind,
      url: mediaUrl(f.file),
      name: f.name,
      ...(f.width ? { width: f.width } : {}),
      ...(f.height ? { height: f.height } : {}),
    })),
    status: m.senderId !== meId ? 'read' : readerSees.otherReadAt && readerSees.otherReadAt >= m.createdAt ? 'read' : otherOnline ? 'delivered' : 'sent',
    ...(m.forwarded ? { forwarded: true } : {}),
  }))
}

/** One message as each side should see it, pushed to every open tab of everyone in the conversation. */
export async function pushMessage(conversationId: string, message: MessageRow, senderId: string) {
  const members = await db.select().from(conversationMembers).where(eq(conversationMembers.conversationId, conversationId))
  for (const member of members) {
    const other = members.find((m) => m.userId !== member.userId)
    const [shaped] = await shapeMessages([message], member.userId, { otherId: other?.userId, otherReadAt: other?.lastReadAt })
    send(member.userId, { channel: 'chat', event: { type: 'message', message: shaped } })
    const [conversation] = await listConversations(member.userId, conversationId)
    if (conversation) send(member.userId, { channel: 'chat', event: { type: 'conversation', conversation } })
    if (member.userId !== senderId) void notifyMessage(member.userId, senderId, message)
  }
}

/** The pop-up notification for a message, unless they've turned those off or asked not to be disturbed. */
async function notifyMessage(toUserId: string, fromUserId: string, message: MessageRow) {
  const [to, from] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, toUserId) }),
    db.query.users.findFirst({ where: eq(users.id, fromUserId) }),
  ])
  if (!to || !from || !to.notifyMessages || to.status === 'dnd') return
  send(toUserId, {
    channel: 'chat',
    event: {
      type: 'notification',
      from: { id: from.id, name: from.name, avatarUrl: avatarUrl(from.avatarFile) },
      message: message.text?.slice(0, 120) || 'Sent a photo',
      conversationId: message.conversationId,
    },
  })
}

export const pushTo = (userIds: string[], push: Push) => userIds.forEach((id) => send(id, push))
