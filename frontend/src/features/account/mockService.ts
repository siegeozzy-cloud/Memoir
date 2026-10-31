import { me } from '../../mocks/people'
import type { PresenceStatus } from '../../shared/types'
import type { AccountService, NotificationPrefs, Profile } from './service'

// Keeps the profile in localStorage. The picture is shrunk to a small JPEG so it fits there.

const KEY = 'memoir.profile'
const SESSION_KEY = 'memoir.session' // saved by the mock auth service

type Stored = { name: string; status: PresenceStatus; avatarUrl?: string; uniqueId: string; notifications: NotificationPrefs }

/** e.g. MMR-7K2Q-9XA4; no 0/O or 1/I, so it's easy to read out to a friend */
function newUniqueId() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const s = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => abc[b % abc.length]).join('')
  return `MMR-${s.slice(0, 4)}-${s.slice(4)}`
}

function sessionName() {
  try {
    const raw = localStorage.getItem(SESSION_KEY) ?? sessionStorage.getItem(SESSION_KEY)
    const name = raw ? (JSON.parse(raw).user?.name as string | undefined) : undefined
    return name?.trim() || 'Explorer'
  } catch {
    return 'Explorer'
  }
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Stored
  } catch {
    // fall through to a fresh profile
  }
  const fresh: Stored = { name: sessionName(), status: 'online', uniqueId: newUniqueId(), notifications: { messages: true, tags: true, friendRequests: true } }
  write(fresh)
  return fresh
}

function write(s: Stored) {
  localStorage.setItem(KEY, JSON.stringify(s))
}

const toProfile = (s: Stored): Profile => ({
  user: { ...me, name: s.name, status: s.status, avatarUrl: s.avatarUrl },
  uniqueId: s.uniqueId,
  notifications: s.notifications,
})

/** Square-crops and shrinks a picture to a 256px JPEG data URL. */
async function shrink(file: File, size = 256) {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size)
  bmp.close()
  return canvas.toDataURL('image/jpeg', 0.86)
}

export const mockAccountService: AccountService = {
  async load() {
    return toProfile(read())
  },

  async update(patch) {
    const s = read()
    if (patch.name !== undefined && patch.name.trim()) s.name = patch.name.trim()
    if (patch.status) s.status = patch.status
    if (patch.notifications) s.notifications = { ...s.notifications, ...patch.notifications }
    if (patch.avatar) s.avatarUrl = await shrink(patch.avatar)
    write(s)
    return toProfile(s)
  },

  async deactivate() {
    // the real server hides the profile until the next sign-in; nothing to keep here
  },

  async remove() {
    localStorage.removeItem(KEY)
  },
}
