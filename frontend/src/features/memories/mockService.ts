import { RECENTLY_DELETED_DAYS } from '../../app/config'
import { ME_ID } from '../../mocks/people'
import { placeholderImage } from '../../shared/lib/placeholderImage'
import type { MediaItem, Memory, Place } from '../../shared/types'
import type { MemoryEvent, MemoryPatch, MemoryService, PostDraft } from './service'

// In-memory stand-in for the posts backend. State resets on reload.

let seq = 0
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const place = (name: string, country: string, countryCode: string, lat: number, lon: number): Place => ({ name, country, countryCode, lat, lon })
const photos = (seed: string, n: number): MediaItem[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${seed}_${i}`, kind: 'image', url: placeholderImage(`${seed}${i}`), name: `${seed}-${i + 1}.jpg`, width: 640, height: 480 }))

function seed(): Memory[] {
  const post = (id: string, ownerId: string, p: Place, n: number, taggedIds: string[], capturedAt: string, extra: Partial<Memory> = {}): Memory => ({
    id,
    ownerId,
    title: p.name,
    place: p,
    items: photos(id, n),
    taggedIds,
    capturedAt,
    createdAt: capturedAt,
    ...extra,
  })
  const oct9 = new Date(2026, 9, 9, 18, 30).toISOString()
  return [
    // yours (Logged Captures)
    post('cap_manila', ME_ID, place('Manila', 'Philippines', 'PH', 14.5995, 120.9842), 3, ['jack'], oct9),
    post('cap_qc', ME_ID, place('Quezon City', 'Philippines', 'PH', 14.676, 121.0437), 1, ['jack'], oct9),
    post('cap_sg', ME_ID, place('Singapore', 'Singapore', 'SG', 1.2903, 103.852), 1, ['jack'], oct9),
    post('cap_alice', ME_ID, place('Alice Springs', 'Australia', 'AU', -23.698, 133.8807), 4, ['theo'], new Date(2026, 8, 14, 7, 10).toISOString(), {
      title: 'Red Centre road trip',
    }),
    post('cap_baguio', ME_ID, place('Baguio', 'Philippines', 'PH', 16.4023, 120.596), 2, [], new Date(2026, 7, 2).toISOString(), { deletedAt: daysAgo(3) }),
    post('cap_cebu', ME_ID, place('Cebu City', 'Philippines', 'PH', 10.3157, 123.8854), 1, ['mara'], new Date(2026, 6, 20).toISOString(), { deletedAt: daysAgo(12) }),
    // friends' posts you're tagged in (so you can see them on the globe)
    post('mara_mumbai', 'mara', place('Mumbai', 'India', 'IN', 19.076, 72.8777), 5, [ME_ID, 'jack'], daysAgo(20), { title: 'Monsoon week' }),
    post('jack_market', 'jack', place('Manila', 'Philippines', 'PH', 14.58, 121.0), 6, [ME_ID, 'mara', 'theo'], daysAgo(2), { title: 'Night market run' }),
  ]
}

const expired = (m: Memory) => !!m.deletedAt && Date.now() - Date.parse(m.deletedAt) > RECENTLY_DELETED_DAYS * 86_400_000

class MockMemoryService implements MemoryService {
  readonly meId = ME_ID
  private memories = seed()
  private listeners = new Set<(e: MemoryEvent) => void>()

  private emit(e: MemoryEvent) {
    for (const l of this.listeners) l(e)
  }

  private mine(ids: string[]) {
    return this.memories.filter((m) => ids.includes(m.id) && m.ownerId === ME_ID)
  }

  private changed(m: Memory) {
    this.emit({ type: 'upsert', memory: structuredClone(m) })
  }

  async list() {
    // the server would run this clean-up on a schedule
    this.memories = this.memories.filter((m) => !expired(m))
    // only the owner and tagged people can see a post
    return structuredClone(this.memories.filter((m) => m.ownerId === ME_ID || (m.taggedIds.includes(ME_ID) && !m.deletedAt)))
  }

  async create(draft: PostDraft) {
    await delay(500) // stands in for the upload
    const now = new Date().toISOString()
    const m: Memory = {
      id: uid('cap'),
      ownerId: ME_ID,
      title: draft.title?.trim() || draft.place.name,
      place: draft.place,
      // a real backend would upload the files (and convert HEIC) and return their URLs
      items: draft.files.map((f) => ({
        id: uid('img'),
        kind: f.type.startsWith('video/') ? 'video' : 'image',
        url: URL.createObjectURL(f),
        name: f.name,
      })),
      taggedIds: draft.taggedIds,
      capturedAt: draft.capturedAt ?? now,
      createdAt: now,
    }
    this.memories.push(m)
    this.changed(m)
    return structuredClone(m)
  }

  async update(id: string, patch: MemoryPatch) {
    const [m] = this.mine([id])
    if (!m) throw new Error(`Not your post: ${id}`)
    if (patch.addFiles?.length) await delay(500) // stands in for the upload
    if (patch.place) m.place = patch.place
    if (patch.taggedIds) m.taggedIds = [...patch.taggedIds]
    if (patch.removeItemIds?.length) {
      const keep = m.items.filter((it) => !patch.removeItemIds!.includes(it.id))
      if (!keep.length && !patch.addFiles?.length) throw new Error('A post needs at least one photo')
      for (const it of m.items) if (!keep.includes(it) && it.url.startsWith('blob:')) URL.revokeObjectURL(it.url)
      m.items = keep
    }
    if (patch.addFiles?.length) {
      m.items.push(...patch.addFiles.map((f): Memory['items'][number] => ({ id: uid('img'), kind: f.type.startsWith('video/') ? 'video' : 'image', url: URL.createObjectURL(f), name: f.name })))
    }
    if (patch.title !== undefined) m.title = patch.title.trim() || m.place.name
    else if (patch.place && m.title === m.place.name) m.title = patch.place.name
    this.changed(m)
    return structuredClone(m)
  }

  async trash(ids: string[]) {
    const now = new Date().toISOString()
    for (const m of this.mine(ids)) {
      m.deletedAt = now
      this.changed(m)
    }
  }

  async restore(ids: string[]) {
    for (const m of this.mine(ids)) {
      delete m.deletedAt
      this.changed(m)
    }
  }

  async purge(ids: string[]) {
    for (const m of this.mine(ids).filter((x) => x.deletedAt)) {
      for (const it of m.items) if (it.url.startsWith('blob:')) URL.revokeObjectURL(it.url)
      this.memories = this.memories.filter((x) => x !== m)
      this.emit({ type: 'remove', id: m.id })
    }
  }

  subscribe(listener: (e: MemoryEvent) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const mockMemoryService: MemoryService = new MockMemoryService()
