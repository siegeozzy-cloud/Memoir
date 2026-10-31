import { useId } from 'react'
import { PRESENCE } from '../lib/presence'
import type { PresenceStatus } from '../types'

/** Status marks with their own shapes, not just colours: Active dot, Sleep moon, Do not disturb dash, Inactive ring. */
export default function StatusGlyph({ status, size = 12, className }: { status: PresenceStatus; size?: number; className?: string }) {
  const mask = 'sg' + useId().replace(/[^\w-]/g, '')
  const color = PRESENCE[status].color
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 12 12" aria-hidden="true">
      {status === 'online' && <circle cx="6" cy="6" r="6" fill={color} />}
      {status === 'idle' && (
        <>
          <mask id={mask}>
            <rect width="12" height="12" fill="#fff" />
            <circle cx="3.1" cy="3.3" r="4.3" fill="#000" />
          </mask>
          <circle cx="6" cy="6" r="6" fill={color} mask={`url(#${mask})`} />
        </>
      )}
      {status === 'dnd' && (
        <>
          <circle cx="6" cy="6" r="6" fill={color} />
          <rect x="2.6" y="4.9" width="6.8" height="2.2" rx="1.1" fill="#050505" />
        </>
      )}
      {status === 'offline' && <circle cx="6" cy="6" r="4.4" fill="none" stroke={color} strokeWidth="3.2" />}
    </svg>
  )
}
