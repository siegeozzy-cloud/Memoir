import type { PresenceStatus } from '../types'

export const PRESENCE: Record<PresenceStatus, { label: string; color: string }> = {
  online: { label: 'Active', color: '#3ccf4e' },
  idle: { label: 'Sleep', color: '#f0a232' },
  dnd: { label: 'Do not disturb', color: '#ef4444' },
  offline: { label: 'Inactive', color: '#8a8f98' },
}
