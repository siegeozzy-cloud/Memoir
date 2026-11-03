import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '../../chat/components/icons'
import { TERMS, TERMS_UPDATED } from './terms'
import './terms.css'

type Props = {
  /** Whether the box on the form is already ticked; the button says so. */
  agreed: boolean
  /** Ticks the box on the sign-up form and closes. Only offered once the text has been read to the end. */
  onAgree: () => void
  onClose: () => void
}

/**
 * The Terms and Agreements, over the sign-up form. The Agree button stays out of reach until the
 * text has been scrolled to the end, so nobody agrees to something they never saw.
 *
 * Focus is moved into the dialog and kept there while it is open: Escape closes it, Tab cycles
 * inside it, and the form behind can't be typed into. On the way out, focus goes back where it was.
 *
 * It hangs off <body> rather than off the form, because the card it would otherwise sit inside is
 * animated, and an animated transform makes a containing block that a fixed overlay can't escape —
 * the dialog would be squeezed into the width of the column beside the porthole.
 */
export default function TermsDialog({ agreed, onAgree, onClose }: Props) {
  const dialog = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [read, setRead] = useState(agreed)

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    dialog.current?.focus()

    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation() // closes this dialog, not the screen behind it
        onClose()
        return
      }
      if (e.key !== 'Tab' || !dialog.current) return
      // keep Tab inside the dialog
      const stops = dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
      const first = stops[0]
      const last = stops[stops.length - 1]
      if (!first || !last) return
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', keys, true)
    return () => {
      window.removeEventListener('keydown', keys, true)
      opener?.focus?.()
    }
  }, [onClose])

  // a short page needs no scrolling, so it counts as read as soon as it's open
  useEffect(() => {
    const el = scroller.current
    if (el && el.scrollHeight <= el.clientHeight + 8) setRead(true)
  }, [])

  const onScroll = () => {
    const el = scroller.current
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 24) setRead(true)
  }

  return createPortal(
    <div className="terms-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="terms" role="dialog" aria-modal="true" aria-labelledby="terms-title" ref={dialog} tabIndex={-1}>
        <header className="terms-head">
          <div>
            <h2 id="terms-title">Terms and Agreements</h2>
            <p className="terms-updated">Last updated {TERMS_UPDATED}</p>
          </div>
          <button type="button" className="terms-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>

        <div className="terms-body" ref={scroller} onScroll={onScroll} tabIndex={0} role="region" aria-labelledby="terms-title">
          {TERMS.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <footer className="terms-foot">
          <p className="terms-hint" role="status">
            {read ? 'That’s all of it.' : 'Scroll to the end to agree.'}
          </p>
          <div className="terms-actions">
            <button type="button" className="terms-quiet" onClick={onClose}>
              Close
            </button>
            <button type="button" className="terms-agree" disabled={!read} onClick={onAgree}>
              {agreed ? 'Keep agreed' : 'I agree'}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
