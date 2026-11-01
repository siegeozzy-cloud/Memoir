// Call controls (24×24, drawn in currentColor).

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const handset = 'M6.6 3.5c.8 0 1.5.5 1.8 1.2l1 2.4c.3.7.1 1.5-.5 2l-1.1.9a12.5 12.5 0 0 0 6.2 6.2l.9-1.1c.5-.6 1.3-.8 2-.5l2.4 1c.7.3 1.2 1 1.2 1.8v2.3c0 1.1-.9 2-2 2A16.8 16.8 0 0 1 2.5 5.5c0-1.1.9-2 2-2z'

export const MicOnIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...line}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </svg>
)

export const MicOffIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...line}>
    <path d="M9 5a3 3 0 0 1 6 0v5m-6 1.2V8" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 10.2 5.3M18.5 11.5v.4M12 18v3" />
    <path d="M4 3.5 20 20.5" />
  </svg>
)

export const VideoOnIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...line}>
    <rect x="3" y="6" width="12.5" height="12" rx="3" />
    <path d="m15.5 11 5.5-3.2v8.4L15.5 13z" />
  </svg>
)

export const CameraOffIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...line}>
    <path d="M9.5 6h3a3 3 0 0 1 3 3v2.5m0 3V15a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 2-2.8" />
    <path d="m15.5 11 5.5-3.2v8.4l-2.6-1.5" />
    <path d="M4 3.5 20 20.5" />
  </svg>
)

export const HangUpIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <g transform="rotate(133 12 12)">
      <path d={handset} fill="currentColor" />
    </g>
  </svg>
)

export const PhoneUpIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d={handset} fill="currentColor" />
  </svg>
)
