import type { UserRow } from '../../db/schema.ts'

// What the web app gets to see of a user. Never the password hash or internal timestamps.

export const avatarUrl = (file: string | null) => (file ? `/api/files/avatars/${file}` : undefined)

/** Matches the web app's `User`. */
export const publicUser = (u: UserRow) => ({ id: u.id, name: u.name, status: u.status, avatarUrl: avatarUrl(u.avatarFile) })

/** Matches the web app's `Session`. */
export const sessionOf = (u: UserRow) => ({ user: publicUser(u), email: u.email })

/** Matches the web app's `Profile`. */
export const profileOf = (u: UserRow) => ({
  user: publicUser(u),
  uniqueId: u.uniqueId,
  notifications: { messages: u.notifyMessages, tags: u.notifyTags, friendRequests: u.notifyFriendRequests },
})
