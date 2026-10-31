// Line icons for the chat panel, drawn to match the dock (2px-ish strokes, round caps).

type P = { size?: number }
const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const SearchIcon = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.6}>
    <circle cx="10.5" cy="10.5" r="7" />
    <path d="m16 16 5 5" />
  </svg>
)

export const AddPersonIcon = ({ size = 30 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="19" cy="10" r="5.5" fill="currentColor" />
    <path d="M9 27c0-5.5 4.5-9.5 10-9.5s10 4 10 9.5z" fill="currentColor" />
    <path d="M3 13h7M6.5 9.5v7" {...stroke} strokeWidth={2.4} />
  </svg>
)

export const ChevronIcon = ({ size = 22, dir = 'right' }: P & { dir?: 'left' | 'right' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} style={dir === 'left' ? { transform: 'scaleX(-1)' } : undefined}>
    <path d="m9 5 7 7-7 7" />
  </svg>
)

export const PhoneIcon = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M6.6 2.6c.6-.4 1.4-.3 1.9.3l2.2 2.9c.4.6.4 1.4-.1 1.9l-1.4 1.5c.9 2 2.6 3.8 4.6 4.8l1.5-1.4c.5-.5 1.3-.6 1.9-.2l3 2.1c.6.4.8 1.3.4 1.9l-1.2 2c-.6 1-1.8 1.5-2.9 1.3C10.3 18.6 5.4 13.7 4.3 7.5c-.2-1.1.3-2.3 1.3-2.9z"
    />
  </svg>
)

export const VideoIcon = ({ size = 32 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 24" aria-hidden="true">
    <rect x="1" y="3" width="20" height="18" rx="4.5" fill="currentColor" />
    <path d="M23 9.5 30 5v14l-7-4.5z" fill="currentColor" />
  </svg>
)

export const MoreIcon = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <circle cx="12" cy="4.5" r="2.2" />
    <circle cx="12" cy="12" r="2.2" />
    <circle cx="12" cy="19.5" r="2.2" />
  </svg>
)

export const PlusCircleIcon = ({ size = 30 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.5}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 7v10M7 12h10" />
  </svg>
)

export const SendIcon = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M21.6 2.4 2.9 9.6c-.8.3-.8 1.4 0 1.7l6.6 2.6 2.6 6.6c.3.8 1.4.8 1.7 0l7.2-18.7c.2-.4-.2-.8-.6-.6zM10.3 12.4 17 7l-5.4 6.7z" />
  </svg>
)

export const CloseIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const BackIcon = ({ size = 24 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
)

export const PlayIcon = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="rgba(0,0,0,.55)" />
    <path d="M10 8v8l6-4z" fill="#fff" />
  </svg>
)

export const SpotifyIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#1ed760" />
    <path d="M6.5 9.2c3.8-1.1 7.9-.8 11.2 1M7.2 12.4c3.1-.9 6.4-.6 9.2.9M7.8 15.4c2.5-.7 5-.5 7.2.7" fill="none" stroke="#000" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
)

export const PinIcon = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M12 2C8 2 5 5 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
  </svg>
)

export const ForwardIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.8}>
    <path d="M14 5.5 20 11l-6 5.5" />
    <path d="M20 11h-8.5A6.5 6.5 0 0 0 5 17.5V19" />
  </svg>
)

export const CopyIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.8}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </svg>
)

export const CheckIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2.2}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
)

export const TrashIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.8}>
    <path d="M4.5 7h15M9.5 7V5.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V7" />
    <path d="M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7M10 11v5M14 11v5" />
  </svg>
)
