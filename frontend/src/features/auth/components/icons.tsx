// Line icons for the sign-in and sign-up forms (24×24, drawn in currentColor).

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...line}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
      <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
    </svg>
  )
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...line}>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
    </svg>
  )
}

export function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...line}>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5 19.5c1.2-3.3 3.9-5 7-5s5.8 1.7 7 5" />
    </svg>
  )
}

export function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...line}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...line}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 3.5 20 20.5" />
    </svg>
  )
}

export function ArrowRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...line} strokeWidth={2}>
      <path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" />
    </svg>
  )
}
