import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Memory } from '../../shared/types'
import type { MemoryPatch, MemoryService, PostDraft } from './service'

const newestFirst = (a: Memory, b: Memory) => b.capturedAt.localeCompare(a.capturedAt)

/** Posts for the UI, kept in sync with a MemoryService. */
export function useMemories(service: MemoryService) {
  const [all, setAll] = useState<Memory[]>([])

  const upsert = useCallback((m: Memory) => setAll((list) => [...list.filter((x) => x.id !== m.id), m]), [])

  useEffect(() => {
    let cancelled = false
    service.list().then((list) => {
      if (!cancelled) setAll(list)
    })
    const off = service.subscribe((e) => {
      if (e.type === 'upsert') upsert(e.memory)
      else setAll((list) => list.filter((x) => x.id !== e.id))
    })
    return () => {
      cancelled = true
      off()
    }
  }, [service, upsert])

  /** Everything shown on the globe. */
  const visible = useMemo(() => all.filter((m) => !m.deletedAt).sort(newestFirst), [all])
  /** Logged Captures: your own posts. */
  const mine = useMemo(() => visible.filter((m) => m.ownerId === service.meId), [visible, service.meId])
  /** Recently Deleted, most recently deleted first. */
  const deleted = useMemo(
    () => all.filter((m) => m.deletedAt && m.ownerId === service.meId).sort((a, b) => b.deletedAt!.localeCompare(a.deletedAt!)),
    [all, service.meId],
  )

  const create = useCallback(
    async (draft: PostDraft) => {
      const m = await service.create(draft)
      upsert(m)
      return m
    },
    [service, upsert],
  )
  const trash = useCallback((ids: string[]) => service.trash(ids), [service])
  const restore = useCallback((ids: string[]) => service.restore(ids), [service])
  const purge = useCallback((ids: string[]) => service.purge(ids), [service])
  const update = useCallback(
    async (id: string, patch: MemoryPatch) => {
      const m = await service.update(id, patch)
      upsert(m)
      return m
    },
    [service, upsert],
  )
  const byId = useCallback((id: string) => all.find((m) => m.id === id), [all])

  return { meId: service.meId, visible, mine, deleted, byId, create, update, trash, restore, purge }
}

export type MemoriesApi = ReturnType<typeof useMemories>
