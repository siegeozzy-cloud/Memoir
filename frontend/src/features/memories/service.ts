import type { Memory, Place } from '../../shared/types'

export type PostDraft = {
  files: File[]
  place: Place
  /** Defaults to the place name. */
  title?: string
  taggedIds: string[]
  /** ISO 8601; defaults to now. */
  capturedAt?: string
}

/** Changes from the Edit screen. Only the keys present are changed. */
export type MemoryPatch = {
  /** Album name; empty means "use the place name". */
  title?: string
  taggedIds?: string[]
  place?: Place
  removeItemIds?: string[]
  /** New photos to upload into the album. */
  addFiles?: File[]
}

/** Pushed by the backend (a WebSocket in production, the mock here). */
export type MemoryEvent = { type: 'upsert'; memory: Memory } | { type: 'remove'; id: string }

/**
 * Everything the app needs from the posts backend. The UI only talks to this interface;
 * `mockMemoryService` implements it in memory until the real server exists.
 */
export interface MemoryService {
  readonly meId: string
  /**
   * Posts you can see: yours (including ones in Recently Deleted, with deletedAt set) and posts you're
   * tagged in. A post is private to its owner and the people tagged in it; the server must enforce this.
   */
  list(): Promise<Memory[]>
  /** Uploads the files and creates the post. */
  create(draft: PostDraft): Promise<Memory>
  /** Edits one of your posts. A post always keeps at least one photo. */
  update(id: string, patch: MemoryPatch): Promise<Memory>
  /** Soft delete: moves your posts to Recently Deleted. */
  trash(ids: string[]): Promise<void>
  restore(ids: string[]): Promise<void>
  /** Deletes for good. Only for posts already in Recently Deleted. */
  purge(ids: string[]): Promise<void>
  subscribe(listener: (event: MemoryEvent) => void): () => void
}
