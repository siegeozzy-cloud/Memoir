import { api } from '../../shared/lib/api'
import { onChannel } from '../../shared/lib/socket'
import type { Memory } from '../../shared/types'
import type { MemoryEvent, MemoryService } from './service'

// The real posts backend (../backend, /api/memories). The server decides what you may see:
// your own posts and the ones you're tagged in, nothing else.

export function makeHttpMemoryService(meId: string): MemoryService {
  const ids = (ids: string[]) => ({ method: 'POST' as const, json: { ids } })

  return {
    meId,

    async list() {
      if (!meId) return []
      return (await api<{ memories: Memory[] }>('/memories')).memories
    },

    create(draft) {
      const { files, ...rest } = draft
      const form = new FormData()
      form.append('draft', JSON.stringify(rest))
      for (const file of files) form.append('files', file)
      return api<Memory>('/memories', { method: 'POST', form })
    },

    update(id, patch) {
      const { addFiles, ...rest } = patch
      const form = new FormData()
      form.append('patch', JSON.stringify(rest))
      for (const file of addFiles ?? []) form.append('files', file)
      return api<Memory>(`/memories/${id}`, { method: 'PATCH', form })
    },

    trash: (list) => api('/memories/trash', ids(list)),
    restore: (list) => api('/memories/restore', ids(list)),
    purge: (list) => api('/memories/purge', ids(list)),

    subscribe(listener: (event: MemoryEvent) => void) {
      return onChannel('memories', (push) => {
        const event = push.event as MemoryEvent | { type: 'notification' } | undefined
        if (event && event.type !== 'notification') listener(event)
      })
    },
  }
}
