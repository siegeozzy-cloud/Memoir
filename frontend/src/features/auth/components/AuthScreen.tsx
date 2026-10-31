import { useLayoutEffect, useRef, useState } from 'react'
import logo from '../../../assets/logo-white.svg'
import type { SignInInput, SignUpInput, SignUpResult } from '../service'
import type { GlobeIntro } from '../../globe/GlobeView'
import { PORT_WINDOWS, portholeFraming, type AuthView } from './porthole'
import SignInForm from './SignInForm'
import SignUpForm from './SignUpForm'
import './auth.css'

type Props = {
  /** Signed in: the form fades out while the window opens up into the home screen. */
  leaving: boolean
  onSignIn: (input: SignInInput) => Promise<void>
  onSignUp: (input: SignUpInput) => Promise<SignUpResult>
  /** Where the globe should sit to fill this window (GlobeView's `intro`). */
  onFrame: (frame: GlobeIntro) => void
}

const RIVETS = ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l']

const VERIFIED: Record<string, { text: string; ok: boolean }> = {
  '1': { text: 'Email confirmed. Sign in to start.', ok: true },
  expired: { text: 'That link has expired. Sign in and we’ll send you a new one.', ok: false },
  invalid: { text: 'That link doesn’t work anymore. Sign in to get a new one.', ok: false },
}

/** ?verified=… is where the email confirmation link lands. Read once per page load, then cleared from the address bar. */
const verified = (() => {
  const url = new URL(location.href)
  const result = url.searchParams.get('verified')
  if (result === null) return null
  url.searchParams.delete('verified')
  history.replaceState(null, '', url.pathname + url.search + url.hash)
  return VERIFIED[result] ?? null
})()

// The globe itself is the app's GlobeView behind this screen, clipped to the porthole window
// (see auth.css), so the same globe carries on into the home screen after signing in.
export default function AuthScreen({ leaving, onSignIn, onSignUp, onFrame }: Props) {
  const [view, setView] = useState<AuthView>('signin')
  const [switched, setSwitched] = useState(false)
  const port = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = port.current
    if (!el || leaving) return
    const report = () => {
      // the window is the porthole's padding box, inside the bezel
      const r = el.getBoundingClientRect()
      onFrame(portholeFraming({ x: r.left + el.clientLeft, y: r.top + el.clientTop, w: el.clientWidth, h: el.clientHeight }, view))
    }
    report()
    window.addEventListener('resize', report)
    return () => window.removeEventListener('resize', report)
  }, [view, leaving, onFrame])

  const switchTo = (next: AuthView) => {
    setView(next)
    setSwitched(true)
  }

  return (
    <div className={`auth${leaving ? ' is-leaving' : ''}`} inert={leaving}>
      <div className="porthole" ref={port} aria-hidden="true">
        {RIVETS.map((at) => (
          <span key={at} className={`rivet is-${at}`} />
        ))}
        <div className="porthole-glass">
          <span className="porthole-tag">
            <i className="live-dot" />
            Orbital view · Live
          </span>
          <span className="porthole-tag is-right">Port window · {PORT_WINDOWS[view].label}</span>
        </div>
      </div>

      <section className="auth-side" aria-label={view === 'signin' ? 'Sign in' : 'Create an account'}>
        <div className="auth-column">
          <div className="auth-brand">
            <img src={logo} alt="" />
            <span>Memoir</span>
          </div>
          {view === 'signin' ? (
            <SignInForm key="signin" onSubmit={onSignIn} notice={switched ? null : verified} autoFocus={switched} />
          ) : (
            <SignUpForm key="signup" onSubmit={onSignUp} autoFocus={switched} />
          )}
          <p className="auth-switch">
            {view === 'signin' ? 'New to the cabin? ' : 'Already aboard? '}
            <button type="button" onClick={() => switchTo(view === 'signin' ? 'signup' : 'signin')}>
              {view === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </div>
      </section>
    </div>
  )
}
