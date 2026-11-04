import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../db/client.ts'
import { users } from '../../db/schema.ts'
import { HttpError, parse } from '../../lib/errors.ts'
import { announcePresence } from '../../lib/realtime.ts'
import { endAllSessions, requireAuth, userOf } from '../../lib/session.ts'
import { friendsChanged, friendsOf, userChanged } from '../../lib/user-cache.ts'
import { LIMITS } from '../../lib/uploads.ts'
import { nameSchema, statusSchema } from '../../lib/validation.ts'
import { profileOf } from '../auth/users.ts'
import { deleteAvatar, saveAvatar } from './avatars.ts'

const Patch = z.strictObject(
  {
    name: nameSchema.optional(),
    status: statusSchema.optional(),
    shareActivity: z.boolean().optional(),
    notifications: z.strictObject({ messages: z.boolean().optional(), tags: z.boolean().optional(), friendRequests: z.boolean().optional() }).optional(),
  },
  'Only your name, status, activity sharing and notifications can be changed here.',
)

export default async function accountRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  app.get('/', async (req) => profileOf(userOf(req)))

  app.patch('/', async (req) => {
    const p = parse(Patch, req.body)
    const [user] = await db
      .update(users)
      .set({
        name: p.name,
        status: p.status,
        shareActivity: p.shareActivity,
        notifyMessages: p.notifications?.messages,
        notifyTags: p.notifications?.tags,
        notifyFriendRequests: p.notifications?.friendRequests,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userOf(req).id))
      .returning()
    // the status and sharing preference the presence path reads from memory just changed
    userChanged(user)
    // friends see the new status, name or what you're playing straight away
    void announcePresence(user.id)
    return profileOf(user)
  })

  /** multipart/form-data with one file field. */
  app.put('/avatar', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const part = await req.file({ limits: { fileSize: LIMITS.avatar } })
    if (!part) throw new HttpError(400, 'invalid', 'Choose a picture to upload.', 'avatar')
    let upload: Buffer
    try {
      upload = await part.toBuffer()
    } catch (e) {
      if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
        throw new HttpError(413, 'too-large', `A profile picture can be up to ${Math.round(LIMITS.avatar / (1024 * 1024))} MB.`, 'avatar')
      }
      throw e
    }
    const file = await saveAvatar(upload)
    const before = userOf(req).avatarFile
    const [user] = await db.update(users).set({ avatarFile: file, updatedAt: new Date() }).where(eq(users.id, userOf(req).id)).returning()
    // friends' lists carry the avatar, and presence is answered from memory
    userChanged(user)
    await deleteAvatar(before)
    return profileOf(user)
  })

  /** Hides the account and signs out everywhere; signing in again brings it back. */
  app.post('/deactivate', async (req, reply) => {
    const { id } = userOf(req)
    await db.update(users).set({ deactivatedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, id))
    await endAllSessions(id, reply)
    return reply.code(204).send()
  })

  /** Deletes the account for good. Sessions, email links and the Spotify link go with it (cascade). */
  app.delete('/', async (req, reply) => {
    const user = userOf(req)
    // read before the cascade takes the friendships away, so the people who are about to stop being
    // friends with them reload their list rather than holding one that names a user who is gone
    const friends = await friendsOf(user.id)
    await endAllSessions(user.id, reply)
    await db.delete(users).where(eq(users.id, user.id))
    friendsChanged(user.id, ...friends)
    await deleteAvatar(user.avatarFile)
    return reply.code(204).send()
  })
}
