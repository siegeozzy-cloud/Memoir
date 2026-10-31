import { useCallback, useState } from 'react'
import type { AppNotification } from '../../shared/types'

/** A queue of top-of-screen notifications; they are shown one at a time. */
export function useNotifications() {
  const [queue, setQueue] = useState<AppNotification[]>([])
  const push = useCallback((n: Omit<AppNotification, 'id'>) => {
    setQueue((q) => [...q, { ...n, id: crypto.randomUUID() }])
  }, [])
  const next = useCallback(() => setQueue((q) => q.slice(1)), [])
  return { current: queue[0] as AppNotification | undefined, push, next }
}
