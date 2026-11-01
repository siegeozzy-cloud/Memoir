import { and, asc, eq, inArray, isNotNull, lt, or, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../db/client.ts'
import { friendships, memories, memoryItems, memoryTags } from '../../db/schema.ts'
import { HttpError, parse } from '../../lib/errors.ts'
import { send } from '../../lib/realtime.ts'
import { avatarUrl } from '../auth/users.ts'
import { requireAuth, userOf } from '../../lib/session.ts'
import { deleteMedia, jsonField, mediaUrl, readMultipart, saveMedia, type StoredMedia } from '../../lib/uploads.ts'

// Posts and albums pinned on the globe. A post is private to its owner and the people tagged in it;
// every read here filters on that, so it can't be worked around from the browser.

const RECENTLY_DELETED_DAYS = 30
const MAX_ITEMS = 20

const PlaceInput = z.object({
  name: z.string().trim().min(1, 'Pick where this was taken.').max(120),
  country: z.string().trim().min(1, 'Pick a country.').max(80),
  countryCode: z.string().trim().length(2).optional(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
})
const Draft = z.object({
  place: PlaceInput,
  title: z.string().trim().max(80, 'Use 80 characters or fewer for the album name.').optional(),
  taggedIds: z.array(z.uuid()).max(30).default([]),
  capturedAt: z.iso.datetime().optional(),
})
const Patch = z.object({
  title: z.string().trim().max(80, 'Use 80 characters or fewer for the album name.').optional(),
  taggedIds: z.array(z.uuid()).max(30).optional(),
  place: PlaceInput.optional(),
  removeItemIds: z.array(z.uuid()).optional(),
})
const Ids = z.object({ ids: z.array(z.uuid()).min(1).max(100) })

type Row = typeof memories.$inferSelect

async function shape(rows: Row[]) {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const [items, tags] = await Promise.all([
    db.select().from(memoryItems).where(inArray(memoryItems.memoryId, ids)).orderBy(asc(memoryItems.position)),
    db.select().from(memoryTags).where(inArray(memoryTags.memoryId, ids)),
  ])
  return rows.map((m) => ({
    id: m.id,
    ownerId: m.ownerId,
    title: m.title,
    place: { name: m.placeName, country: m.country, ...(m.countryCode ? { countryCode: m.countryCode } : {}), lat: m.lat, lon: m.lon },
    items: items
      .filter((i) => i.memoryId === m.id)
      .map((i) => ({ id: i.id, kind: i.kind, url: mediaUrl(i.file), ...(i.name ? { name: i.name } : {}), ...(i.width ? { width: i.width } : {}), ...(i.height ? { height: i.height } : {}) })),
    taggedIds: tags.filter((t) => t.memoryId === m.id).map((t) => t.userId),
    capturedAt: m.capturedAt.toISOString(),
    createdAt: m.createdAt.toISOString(),
    ...(m.deletedAt ? { deletedAt: m.deletedAt.toISOString() } : {}),
  }))
}

/** Yours (including Recently Deleted) and the ones you're tagged in (while they're not deleted). */
const visibleTo = (meId: string) =>
  or(eq(memories.ownerId, meId), sql`(${memories.deletedAt} is null and exists (select 1 from ${memoryTags} t where t.memory_id = ${memories.id} and t.user_id = ${meId}))`)

async function ownedOrFail(id: string, meId: string) {
  const row = await db.query.memories.findFirst({ where: eq(memories.id, id) })
  if (!row) throw new HttpError(404, 'no-memory', 'That post isn’t there.')
  if (row.ownerId !== meId) throw new HttpError(403, 'not-yours', 'Only the person who posted it can change it.')
  return row
}

/** Only friends can be tagged, so nobody can push a post into a stranger's globe. */
async function checkTags(meId: string, taggedIds: string[]) {
  const ids = [...new Set(taggedIds)].filter((id) => id !== meId)
  if (!ids.length) return []
  const friends = await db.select({ id: friendships.friendId }).from(friendships).where(and(eq(friendships.userId, meId), inArray(friendships.friendId, ids)))
  if (friends.length !== ids.length) throw new HttpError(400, 'not-friends', 'You can only tag your friends.', 'tags')
  return ids
}

/** Everyone whose globe this post belongs on. */
const audience = (ownerId: string, taggedIds: string[]) => [...new Set([ownerId, ...taggedIds])]

async function pushUpsert(id: string) {
  const row = await db.query.memories.findFirst({ where: eq(memories.id, id) })
  if (!row) return
  const [memory] = await shape([row])
  for (const userId of audience(row.ownerId, memory.taggedIds)) {
    // someone tagged on a post in Recently Deleted shouldn't see it at all
    if (row.deletedAt && userId !== row.ownerId) send(userId, { channel: 'memories', event: { type: 'remove', id } })
    else send(userId, { channel: 'memories', event: { type: 'upsert', memory } })
  }
}

export default async function memoryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth)

  app.get('/', async (req) => {
    const rows = await db.select().from(memories).where(visibleTo(userOf(req).id)).limit(500)
    return { memories: await shape(rows) }
  })

  /** multipart/form-data: a `draft` field (JSON) and the photos as `files`. */
  app.post('/', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const me = userOf(req).id
    const { fields, files } = await readMultipart(req as never, MAX_ITEMS)
    const draft = parse(Draft, jsonField(fields, 'draft'))
    if (!files.length) throw new HttpError(400, 'empty', 'Add at least one photo.', 'files')
    const taggedIds = await checkTags(me, draft.taggedIds)

    const stored: StoredMedia[] = []
    for (const f of files) stored.push(await saveMedia(f.data, f.filename, f.mimetype))

    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(memories)
        .values({
          ownerId: me,
          title: draft.title?.trim() || draft.place.name,
          placeName: draft.place.name,
          country: draft.place.country,
          countryCode: draft.place.countryCode ?? null,
          lat: draft.place.lat,
          lon: draft.place.lon,
          capturedAt: draft.capturedAt ? new Date(draft.capturedAt) : new Date(),
        })
        .returning()
      await tx.insert(memoryItems).values(stored.map((s, i) => ({ memoryId: row.id, kind: s.kind, file: s.file, name: s.name, width: s.width, height: s.height, position: i })))
      if (taggedIds.length) await tx.insert(memoryTags).values(taggedIds.map((userId) => ({ memoryId: row.id, userId })))
      return row.id
    })

    void pushUpsert(id)
    void notifyTagged(me, id, taggedIds)
    const [row] = await db.select().from(memories).where(eq(memories.id, id))
    return (await shape([row]))[0]
  })

  /** multipart/form-data: a `patch` field (JSON) and any new photos as `files`. */
  app.patch('/:id', async (req) => {
    const me = userOf(req).id
    const { id } = req.params as { id: string }
    const before = await ownedOrFail(id, me)
    const { fields, files } = await readMultipart(req as never, MAX_ITEMS)
    const patch = parse(Patch, jsonField(fields, 'patch') ?? {})
    const wasTagged = (await db.select({ userId: memoryTags.userId }).from(memoryTags).where(eq(memoryTags.memoryId, id))).map((t) => t.userId)
    const taggedIds = patch.taggedIds ? await checkTags(me, patch.taggedIds) : undefined

    const items = await db.select().from(memoryItems).where(eq(memoryItems.memoryId, id)).orderBy(asc(memoryItems.position))
    const removing = new Set(patch.removeItemIds ?? [])
    if (items.length - removing.size + files.length < 1) throw new HttpError(400, 'empty', 'A post keeps at least one photo.', 'files')
    if (items.length - removing.size + files.length > MAX_ITEMS) throw new HttpError(400, 'too-many', `An album holds up to ${MAX_ITEMS} photos.`, 'files')

    const stored: StoredMedia[] = []
    for (const f of files) stored.push(await saveMedia(f.data, f.filename, f.mimetype))

    // an album with no name of its own is named after its place, so moving the pin renames it
    const placeName = patch.place?.name ?? before.placeName
    const title =
      patch.title !== undefined ? patch.title.trim() || placeName : patch.place && before.title === before.placeName ? patch.place.name : undefined

    await db.transaction(async (tx) => {
      await tx
        .update(memories)
        .set({
          ...(title !== undefined ? { title } : {}),
          ...(patch.place
            ? { placeName: patch.place.name, country: patch.place.country, countryCode: patch.place.countryCode ?? null, lat: patch.place.lat, lon: patch.place.lon }
            : {}),
        })
        .where(eq(memories.id, id))
      if (removing.size) await tx.delete(memoryItems).where(and(eq(memoryItems.memoryId, id), inArray(memoryItems.id, [...removing])))
      if (stored.length) {
        const from = items.length
        await tx.insert(memoryItems).values(stored.map((s, i) => ({ memoryId: id, kind: s.kind, file: s.file, name: s.name, width: s.width, height: s.height, position: from + i })))
      }
      if (taggedIds) {
        await tx.delete(memoryTags).where(eq(memoryTags.memoryId, id))
        if (taggedIds.length) await tx.insert(memoryTags).values(taggedIds.map((userId) => ({ memoryId: id, userId })))
      }
    })

    await deleteMedia(items.filter((i) => removing.has(i.id)).map((i) => i.file))
    void pushUpsert(id)
    // people untagged by this edit lose it from their globe
    for (const userId of wasTagged.filter((u) => taggedIds && !taggedIds.includes(u))) send(userId, { channel: 'memories', event: { type: 'remove', id } })
    if (taggedIds) void notifyTagged(me, id, taggedIds.filter((u) => !wasTagged.includes(u)))

    const [row] = await db.select().from(memories).where(eq(memories.id, id))
    return (await shape([row]))[0]
  })

  const bulk = (set: Partial<Row>, requireDeleted: boolean) => async (req: Parameters<typeof requireAuth>[0], reply: { code: (n: number) => { send: () => unknown } }) => {
    const me = userOf(req).id
    const { ids } = parse(Ids, req.body)
    const rows = await db.select().from(memories).where(and(eq(memories.ownerId, me), inArray(memories.id, ids), requireDeleted ? isNotNull(memories.deletedAt) : undefined))
    for (const row of rows) {
      await db.update(memories).set(set).where(eq(memories.id, row.id))
      await pushUpsert(row.id)
    }
    return reply.code(204).send()
  }

  app.post('/trash', bulk({ deletedAt: new Date() }, false))
  app.post('/restore', bulk({ deletedAt: null }, true))

  /** Deletes for good, with the photos. Only for posts already in Recently Deleted. */
  app.post('/purge', async (req, reply) => {
    const me = userOf(req).id
    const { ids } = parse(Ids, req.body)
    const rows = await db.select().from(memories).where(and(eq(memories.ownerId, me), inArray(memories.id, ids), isNotNull(memories.deletedAt)))
    for (const row of rows) {
      const items = await db.select().from(memoryItems).where(eq(memoryItems.memoryId, row.id))
      await db.delete(memories).where(eq(memories.id, row.id))
      await deleteMedia(items.map((i) => i.file))
      send(me, { channel: 'memories', event: { type: 'remove', id: row.id } })
    }
    return reply.code(204).send()
  })
}

/** Tells people they've been tagged, unless they've turned that off or asked not to be disturbed. */
async function notifyTagged(fromId: string, memoryId: string, taggedIds: string[]) {
  if (!taggedIds.length) return
  const from = await db.query.users.findFirst({ where: (u, { eq: is }) => is(u.id, fromId) })
  const rows = await db.query.users.findMany({ where: (u, { inArray: within }) => within(u.id, taggedIds) })
  for (const to of rows) {
    if (!to.notifyTags || to.status === 'dnd' || !from) continue
    send(to.id, {
      channel: 'memories',
      event: {
        type: 'notification',
        from: { id: from.id, name: from.name, avatarUrl: avatarUrl(from.avatarFile) },
        message: 'Tagged you in an Album',
        memoryId,
      },
    })
  }
}

/** Empties Recently Deleted after 30 days. Runs on start-up, then daily. */
export async function purgeOldMemories() {
  const cutoff = new Date(Date.now() - RECENTLY_DELETED_DAYS * 24 * 60 * 60 * 1000)
  const rows = await db.select().from(memories).where(and(isNotNull(memories.deletedAt), lt(memories.deletedAt, cutoff)))
  for (const row of rows) {
    const items = await db.select().from(memoryItems).where(eq(memoryItems.memoryId, row.id))
    await db.delete(memories).where(eq(memories.id, row.id))
    await deleteMedia(items.map((i) => i.file))
  }
  return rows.length
}
