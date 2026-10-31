import { useState } from 'react'
import type { MemoryPatch } from '../service'
import type { Memory, User } from '../../../shared/types'
import { EditSquareIcon } from './icons'
import PostForm, { type Placement } from './PostForm'
import { usePhotoPicker } from './usePhotoPicker'

type Props = {
  memory: Memory
  friends: User[]
  placement: Placement
  onBack: () => void
  onSave: (patch: MemoryPatch) => Promise<void>
}

// The Edit screen: the same form as Post, filled in from the post. Nothing changes until Save.
export default function EditPost({ memory: m, friends, placement, onBack, onSave }: Props) {
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  const kept = m.items.filter((it) => !removed.has(it.id))
  const picker = usePhotoPicker(kept.length)
  const total = kept.length + picker.picked.length
  const gpsFrom = picker.picked.find((p) => p.meta?.gps)

  return (
    <>
      <input {...picker.inputProps} />
      <PostForm
        head={{ icon: <EditSquareIcon />, title: 'Edit', subtitle: 'Don’t forget to click save upon exit' }}
        photos={[
          ...kept.map((it) => ({ id: it.id, url: it.url, name: it.name ?? m.title })),
          ...picker.picked.map((p) => ({ id: p.id, url: p.url, name: p.file.name, fromGps: p === gpsFrom })),
        ]}
        canRemove={total > 1}
        onRemovePhoto={(id) => {
          if (picker.picked.some((p) => p.id === id)) picker.remove(id)
          else setRemoved((r) => new Set(r).add(id))
        }}
        onAddFiles={picker.add}
        onBrowse={picker.browse}
        errors={picker.errors}
        friends={friends}
        placement={placement}
        // an untouched album name means "named after the place", so it follows a new location
        initial={{ title: m.title === m.place.name ? '' : m.title, taggedIds: m.taggedIds, pin: { lat: m.place.lat, lon: m.place.lon } }}
        photosChanged={removed.size > 0 || picker.picked.length > 0}
        submitLabel="Save"
        confirmDiscard
        onSubmit={async ({ title, taggedIds, pin, place }) => {
          const moved = pin.lat !== m.place.lat || pin.lon !== m.place.lon
          await onSave({
            title,
            taggedIds,
            place: moved ? place : undefined,
            removeItemIds: [...removed],
            addFiles: picker.picked.map((p) => p.file),
          })
        }}
        onBack={onBack}
      />
    </>
  )
}
