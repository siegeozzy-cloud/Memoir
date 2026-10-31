import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../db/client.ts'
import { users } from '../../db/schema.ts'
import { HttpError, parse } from '../../lib/errors.ts'
import { endAllSessions, requireAuth, userOf } from '../../lib/session.ts'
import { nameSchema, statusSchema } from '../../lib/validation.ts'
import { profileOf } from '../auth/users.ts'
import { deleteAvatar, saveAvatar } from './avatars.ts'

const Patch = z.strictObject(
  {
    name: nameSchema.optional(),
    status: statusSchema.optional(),
    notifications: z.strictObject({ messages: z.boolean().optional(), tags: z.boolean().optional(), friendRequests: z.boolean().optional() }).optional(),
  },
  'Only name, status and notifications can be changed here.',
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
        notifyMessages: p.notifications?.messages,
        notifyTags: p.notifications?.tags,
        notifyFriendRequests: p.notifications?.friendRequests,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userOf(req).id))
      .returning()
    return profileOf(user)
  })

  /** multipart/form-data with one file field. */
  app.put('/avatar', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const part = await req.file()
    if (!part) throw new HttpError(400, 'invalid', 'Choose a picture to upload.', 'avatar')
    const file = await saveAvatar(userOf(req).id, await part.toBuffer())
    const before = userOf(req).avatarFile
    const [user] = await db.update(users).set({ avatarFile: file, updatedAt: new Date() }).where(eq(users.id, userOf(req).id)).returning()
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
    await endAllSessions(user.id, reply)
    await db.delete(users).where(eq(users.id, user.id))
    await deleteAvatar(user.avatarFile)
    return reply.code(204).send()
  })
}
