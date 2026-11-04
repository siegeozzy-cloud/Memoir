import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { friendships, users, type UserRow } from '../db/schema.ts'

/**
 * What the realtime path needs to know about the people who have the app open, kept in memory.
 *
 * **Why this exists.** The Spotify sweep (features/spotify/activity.ts) runs every ten seconds for
 * as long as anybody has a socket open, and presence is announced to a person's friends on every
 * track change. Reading the same handful of rows out of Postgres each time is what made that
 * expensive: a serverless database is metered by how long its compute stays awake, and it only
 * suspends after a few minutes with no queries. A timer that queries every ten seconds means it
 * never suspends — so one client that simply stays connected (a desktop app sitting in the tray,
 * say) burned the whole month's compute allowance by the middle of the month and took the app down
 * with it, without anybody having *done* anything.
 *
 * Cached, a connected-but-idle person costs no queries at all, and the database is awake only while
 * somebody is actually doing something. See docs/deploy.md, "Staying inside the free limits".
 *
 * **The contract.** The few places that write these rows have to say so here; they are named on
 * each `…Changed` function below. Getting that wrong is not an error, only staleness: every read
 * falls back to the database on a miss, so the worst case is a friend seeing an old status until
 * the next change. Nothing here is a source of truth.
 *
 * **Bounded on purpose.** Only people being watched — those with a socket open — are stored, and
 * `unwatchUser` drops them when the last one closes. A read for anybody else goes to the database
 * and is deliberately not kept, so a passing lookup can't grow this map without limit.
 *
 * One server's memory, which is all there is today. The moment there are two, this has to move to
 * something both can see (Redis), or each will answer with only the half of the world it can see —
 * the same reason presence itself is single-server today. See docs/roadmap.md.
 */

/** Full rows for people with a socket open. */
const watched = new Map<string, UserRow>()
/** Friend ids, for the people in `watched`. */
const friendIds = new Map<string, string[]>()

/** Starts caching this person: their first socket just opened. */
export function watchUser(user: UserRow) {
  watched.set(user.id, user)
}

/** Stops: their last socket just closed. */
export function unwatchUser(userId: string) {
  watched.delete(userId)
  friendIds.delete(userId)
}

/**
 * A user row was written, so replace what we hold.
 *
 * Callers: the profile patch and the avatar upload (features/account/routes.ts). Both already have
 * the updated row from `returning()`, so this costs nothing. Only refreshes someone we're watching
 * — a write for somebody with no socket open has nothing to keep in step.
 */
export function userChanged(user: UserRow) {
  if (watched.has(user.id)) watched.set(user.id, user)
}

/**
 * Someone's friends changed, so the next read reloads them.
 *
 * Caller: `nudge` in features/friends/routes.ts, which is already "your friends list changed,
 * reload it" and is called with everyone affected by becoming, declining or removing a friend.
 * It also fires for a request merely being sent, which changes no friendship — dropping the entry
 * then is harmless, costing one query the next time it is needed.
 */
export function friendsChanged(...userIds: string[]) {
  for (const id of userIds) friendIds.delete(id)
}

/** This person's row: from memory while they're online, otherwise read and not kept. */
export async function cachedUser(userId: string): Promise<UserRow | undefined> {
  const held = watched.get(userId)
  if (held) return held
  return await db.query.users.findFirst({ where: eq(users.id, userId) })
}

/** Who this person is friends with. Kept only for people we're watching. */
export async function friendsOf(userId: string): Promise<string[]> {
  const held = friendIds.get(userId)
  if (held) return held
  const ids = (await db.select({ id: friendships.friendId }).from(friendships).where(eq(friendships.userId, userId))).map((r) => r.id)
  if (watched.has(userId)) friendIds.set(userId, ids)
  return ids
}

/**
 * Rows for several people at once, for the friends list a socket is sent as it opens. Whoever is
 * already in memory is taken from there, and only the rest are read.
 */
export async function cachedUsers(userIds: string[]): Promise<UserRow[]> {
  const found: UserRow[] = []
  const missing: string[] = []
  for (const id of userIds) {
    const held = watched.get(id)
    if (held) found.push(held)
    else missing.push(id)
  }
  if (missing.length) found.push(...(await db.query.users.findMany({ where: inArray(users.id, missing) })))
  return found
}
