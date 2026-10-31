import { forwardRef, useEffect, useState } from 'react'
import type { MemoriesApi } from '../useMemories'
import type { Memory, User } from '../../../shared/types'
import LoggedCaptures from './LoggedCaptures'
import RecentlyDeleted from './RecentlyDeleted'
import EditPost from './EditPost'
import type { Placement } from './PostForm'
import UploadPost from './UploadPost'
import './captures.css'

export type CapturesView = 'list' | 'trash' | 'upload' | 'edit'

type Props = {
  open: boolean
  view: CapturesView
  onViewChange: (v: CapturesView) => void
  memories: MemoriesApi
  users: Record<string, User>
  /** People you can tag in a new post. */
  friends: User[]
  placement: Placement
  onView: (m: Memory) => void
  onLocate: (m: Memory) => void
  onOpenProfile?: (userId: string) => void
}

// Slides in from the left edge. Stays mounted while closed so search and scroll survive.
const CapturesPanel = forwardRef<HTMLElement, Props>(function CapturesPanel({ open, view, onViewChange, memories, users, friends, placement, onView, onLocate, onOpenProfile }, ref) {
  const [justPosted, setJustPosted] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = view === 'edit' && editingId ? memories.mine.find((m) => m.id === editingId) : undefined

  useEffect(() => {
    if (!justPosted) return
    const t = setTimeout(() => setJustPosted(null), 2400)
    return () => clearTimeout(t)
  }, [justPosted])

  return (
    <aside className={`captures${open ? ' is-open' : ''}`} ref={ref} aria-label="Logged Captures" inert={!open}>
      {view === 'upload' ? (
        // remounted on each visit so an abandoned upload doesn't come back
        <UploadPost
          key="upload"
          friends={friends}
          placement={placement}
          onBack={() => onViewChange('list')}
          onPost={async (draft) => {
            const m = await memories.create(draft)
            setJustPosted(m.id)
            onViewChange('list')
            onLocate(m)
          }}
        />
      ) : editing ? (
        <EditPost
          key={editing.id}
          memory={editing}
          friends={friends}
          placement={placement}
          onBack={() => onViewChange('list')}
          onSave={async (patch) => {
            const m = await memories.update(editing.id, patch)
            setJustPosted(m.id)
            onViewChange('list')
            onLocate(m)
          }}
        />
      ) : view === 'trash' ? (
        <RecentlyDeleted items={memories.deleted} users={users} onView={onView} onRestore={memories.restore} onPurge={memories.purge} onBack={() => onViewChange('list')} />
      ) : (
        <LoggedCaptures
          captures={memories.mine}
          deletedCount={memories.deleted.length}
          users={users}
          highlightId={justPosted}
          onView={onView}
          onLocate={onLocate}
          onEdit={(m) => {
            setEditingId(m.id)
            onViewChange('edit')
          }}
          onOpenProfile={onOpenProfile}
          onDelete={memories.trash}
          onOpenTrash={() => onViewChange('trash')}
          onNewPost={() => onViewChange('upload')}
        />
      )}
    </aside>
  )
})

export default CapturesPanel
