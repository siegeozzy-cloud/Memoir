export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'offline'

/** What a user is doing right now, shown next to their name (Discord-style rich presence). */
export type Activity = {
  kind: 'spotify'
  track: string
  artist: string
}

export type User = {
  id: string
  name: string
  avatarUrl?: string
  status: PresenceStatus
  activity?: Activity
}

export type Place = {
  /** City, or "Near <city>" for places away from one. */
  name: string
  country: string
  /** ISO 3166-1 alpha-2, for the flag. */
  countryCode?: string
  lat: number
  lon: number
}

export type MediaItem = {
  id: string
  kind: 'image' | 'video'
  url: string
  name?: string
  width?: number
  height?: number
}

/** A post: one photo, or an album of several. Shown as a pin on the globe. */
export type Memory = {
  id: string
  ownerId: string
  /** Album name. Defaults to the place name; renaming comes later. */
  title: string
  place: Place
  items: MediaItem[]
  taggedIds: string[]
  /** ISO 8601: when the photos were taken. */
  capturedAt: string
  /** ISO 8601: when it was posted. */
  createdAt: string
  /** ISO 8601. Set while the post sits in Recently Deleted. */
  deletedAt?: string
}

export type AppNotification = {
  id: string
  from: User
  message: string
}
