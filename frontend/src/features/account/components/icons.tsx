// Line icons for the profile card (24×24, drawn in currentColor).

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function CameraIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line}>
      <path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h1.6l1.4-2h5l1.4 2h1.6A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </svg>
  )
}

export function CopyIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </svg>
  )
}

export function CheckIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line} strokeWidth={2.2}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

export function ChevronIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line}>
      <path d="m9.5 6 6 6-6 6" />
    </svg>
  )
}

export function SignOutIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...line}>
      <path d="M14 4.5H7A2.5 2.5 0 0 0 4.5 7v10A2.5 2.5 0 0 0 7 19.5h7" />
      <path d="M10.5 12h9M16 8.5l3.5 3.5-3.5 3.5" />
    </svg>
  )
}
