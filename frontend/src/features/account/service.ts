import type { PresenceStatus, User } from '../../shared/types'

/** Which pop-up notifications you get. */
export type NotificationPrefs = { messages: boolean; tags: boolean; friendRequests: boolean }

export type Profile = {
  user: User
  /** Permanent and public: friends can find you by it. */
  uniqueId: string
  /** Let friends see what you're playing on Spotify. */
  shareActivity: boolean
  notifications: NotificationPrefs
}

/** Changes from the profile card. Only the keys present are changed. */
export type ProfilePatch = {
  name?: string
  status?: PresenceStatus
  shareActivity?: boolean
  /** A new profile picture. */
  avatar?: File
  notifications?: Partial<NotificationPrefs>
}

/**
 * The signed-in person's own account: `httpAccountService` talks to ../backend, `mockAccountService`
 * stands in without it. The server checks every change (name length and characters, image type and size).
 */
export interface AccountService {
  load(): Promise<Profile>
  update(patch: ProfilePatch): Promise<Profile>
  /** Hides the profile and posts until the next sign-in. */
  deactivate(): Promise<void>
  /** Deletes the account and everything in it, for good. */
  remove(): Promise<void>
}
