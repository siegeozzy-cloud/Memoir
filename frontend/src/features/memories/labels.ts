import type { Memory } from '../../shared/types'

/** "Album (3 items)", "Single Photo" or "Single Video". */
export const kindLabel = (m: Memory) =>
  m.items.length > 1 ? `Album (${m.items.length} items)` : m.items[0]?.kind === 'video' ? 'Single Video' : 'Single Photo'
