type DockItem = 'add' | 'memories' | 'messages'

type Props = {
  /** The panel that is open, if any; its button is highlighted. */
  active?: DockItem | null
  onAddMemory?: () => void
  onOpenMemories?: () => void
  onOpenMessages?: () => void
}

export default function Dock({ active, onAddMemory, onOpenMemories, onOpenMessages }: Props) {
  return (
    <nav className="dock" aria-label="Main">
      <button type="button" className="dock-btn" aria-label="Pin a memory" title="Pin a memory" aria-pressed={active === 'add'} onClick={onAddMemory}>
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M23.5 12.5c0-4.4-3.4-7.9-7.7-7.9s-7.8 3.5-7.8 7.9c0 5.9 7.8 14.5 7.8 14.5s1.4-1.6 3-3.8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="15.8" cy="12.4" r="3.1" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <path d="M24 19.5v8M20 23.5h8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
      <button type="button" className="dock-btn" aria-label="Memories" title="Memories" aria-pressed={active === 'memories'} onClick={onOpenMemories}>
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <g fill="currentColor">
            <circle cx="5.5" cy="8" r="1.7" />
            <circle cx="5.5" cy="16" r="1.7" />
            <circle cx="5.5" cy="24" r="1.7" />
          </g>
          <path d="M11 8h17M11 16h17M11 24h17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
      <button type="button" className="dock-btn" aria-label="Messages" title="Messages" aria-pressed={active === 'messages'} onClick={onOpenMessages}>
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path fill="currentColor" d="M16.5 3.5C9.3 3.5 3.5 9 3.5 15.8c0 2.3.7 4.5 1.9 6.3L3.8 28.5l6.6-1.8c1.8.9 3.9 1.4 6.1 1.4 7.2 0 13-5.5 13-12.3S23.7 3.5 16.5 3.5z" />
        </svg>
      </button>
    </nav>
  )
}
