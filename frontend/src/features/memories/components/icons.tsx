// Icons for Logged Captures and Upload, drawn to match the design's thin white line style.

type P = { size?: number }
const stroke = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export const SearchIcon = ({ size = 30 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.8}>
    <circle cx="11" cy="11" r="8" />
    <path d="m17 17 4.5 4.5" />
  </svg>
)

export const TrashIcon = ({ size = 26 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.7}>
    <path d="M3.5 6h17M9 6V3.8c0-.4.4-.8.8-.8h4.4c.4 0 .8.4.8.8V6" />
    <rect x="5.5" y="6" width="13" height="15" rx="2" />
    <path d="M10 10v7M14 10v7" />
  </svg>
)

export const ChevronDownIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.8}>
    <path d="m5 9 7 7 7-7" />
  </svg>
)

export const ChevronLeftIcon = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.8}>
    <path d="m15 5-7 7 7 7" />
  </svg>
)

export const ChevronRightIcon = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.8}>
    <path d="m9 5 7 7-7 7" />
  </svg>
)

export const CloudUploadIcon = ({ size = 34 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" {...stroke} strokeWidth={1.9}>
    <path d="M10 24H8.5a6.5 6.5 0 0 1-1-12.9A9 9 0 0 1 25 12.2 6 6 0 0 1 24 24h-2" />
    <path d="M16 28V16M11.5 20.5 16 16l4.5 4.5" />
  </svg>
)

export const BackCircleIcon = ({ size = 30 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.6}>
    <circle cx="12" cy="12" r="10" />
    <path d="M16.5 12h-9M11 8l-4 4 4 4" />
  </svg>
)

export const CloseIcon = ({ size = 20 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={2}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
)

export const PinIcon = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M12 2C8 2 5 5 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-4-3-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
  </svg>
)

export const GlobeIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.7}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M2.5 12h19M12 2.5c2.6 2.8 3.9 6 3.9 9.5s-1.3 6.7-3.9 9.5c-2.6-2.8-3.9-6-3.9-9.5S9.4 5.3 12 2.5z" />
  </svg>
)

export const UploadTrayIcon = ({ size = 32 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" {...stroke} strokeWidth={2}>
    <path d="M16 18V4M10.5 9.5 16 4l5.5 5.5" />
    <rect x="5" y="19" width="22" height="8" rx="2.5" />
    <path d="M10 23h.01M13.5 23h.01" strokeWidth={2.6} />
  </svg>
)

export const EditSquareIcon = ({ size = 30 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" {...stroke} strokeWidth={2}>
    <path d="M15 6H9a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-6" />
    <path d="M23.2 4.8a2.6 2.6 0 0 1 3.7 3.7L16.5 18.9l-4.9 1.2 1.2-4.9z" />
  </svg>
)

/** Small red ⊗ for removing a photo, as in the Post design. */
export const RemoveCircleIcon = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="8.6" fill="#1c1c1c" stroke="#e5484d" strokeWidth="1.5" />
    <path d="m7 7 6 6m0-6-6 6" stroke="#e5484d" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

export const PlusIcon =({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke} strokeWidth={1.8}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
