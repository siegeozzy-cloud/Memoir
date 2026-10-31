type Props = { on: boolean; onChange: (on: boolean) => void }

export default function DetailsToggle({ on, onChange }: Props) {
  const label = on ? 'Hide pins and place names' : 'Show pins and place names'
  return (
    <button type="button" className="details-toggle" aria-pressed={!on} aria-label={label} title={label} onClick={() => onChange(!on)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
        <circle cx="12" cy="12" r="3" />
        {!on && <path d="M4 3.5 20 20.5" />}
      </svg>
    </button>
  )
}
