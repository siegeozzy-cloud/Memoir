import type { UserRow } from '../../db/schema.ts'
import { avatarUrlFor } from '../account/avatars.ts'

// What the web app gets to see of a user. Never the password hash or internal timestamps.

export type Activity = { kind: 'spotify'; track: string; artist: string }

export const avatarUrl = (file: string | null) => (file ? avatarUrlFor(file) : undefined)

type Seen = { status?: UserRow['status']; activity?: Activity }

/**
 * Matches the web app's `User`. `seen` is how this person looks to others right now (presenceOf):
 * offline when they have no tab open, and what they're playing when they share it.
 */
export const publicUser = (u: Pick<UserRow, 'id' | 'name' | 'status' | 'avatarFile'>, seen: Seen = {}) => ({
  id: u.id,
  name: u.name,
  status: seen.status ?? u.status,
  avatarUrl: avatarUrl(u.avatarFile),
  ...(seen.activity ? { activity: seen.activity } : {}),
})

/** Matches the web app's `Session`. */
export const sessionOf = (u: UserRow) => ({ user: publicUser(u), email: u.email })

/** Matches the web app's `Profile`. */
export const profileOf = (u: UserRow) => ({
  user: publicUser(u),
  uniqueId: u.uniqueId,
  shareActivity: u.shareActivity,
  notifications: { messages: u.notifyMessages, tags: u.notifyTags, friendRequests: u.notifyFriendRequests },
})
