type P = { size?: number }
const stroke = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Speech bubble with a note: the lyrics toggle from the design. */
export const LyricsIcon = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.6}>
    <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-4 3.5V17H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    <path d="M7 8.5h5M7 12h4" />
    <path d="M16.5 13.2V7.5l2.3.8" />
    <circle cx="15.4" cy="13.4" r="1.2" />
  </svg>
)

export const PrevIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.7}>
    <path d="M18 5 8 12l10 7z" />
    <path d="M5.5 5v14" />
  </svg>
)

export const NextIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.7}>
    <path d="m6 5 10 7-10 7z" />
    <path d="M18.5 5v14" />
  </svg>
)

export const PlayIcon = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#fff" />
    <path d="M9.6 7.6v8.8l7-4.4z" fill="#000" />
  </svg>
)

export const PauseIcon = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#fff" />
    <path d="M9 7.8h2.1v8.4H9zM12.9 7.8H15v8.4h-2.1z" fill="#000" />
  </svg>
)

export const RepeatIcon = ({ size = 20, one = false }: P & { one?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.6}>
    <path d="M6.5 16.5H6a3.5 3.5 0 0 1-3.5-3.5V10A3.5 3.5 0 0 1 6 6.5h12a3.5 3.5 0 0 1 3.5 3.5v3a3.5 3.5 0 0 1-3.5 3.5h-6.5" />
    <path d="m14 13.8-2.7 2.7 2.7 2.7" />
    {one && <text x="12" y="13.2" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="currentColor" stroke="none">1</text>}
  </svg>
)

export const SpotifyLogo = ({ size = 22, className }: P & { className?: string }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="currentColor" />
    <path d="M6.2 9.1c3.9-1.2 8.4-.9 11.9 1.1M6.9 12.4c3.2-.9 6.8-.6 9.6 1M7.6 15.5c2.6-.7 5.2-.5 7.5.8" fill="none" stroke="var(--logo-ink, #000)" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)
