import { useLayoutEffect, useRef, useState } from 'react'
import logo from '../../../assets/logo-white.svg'
import type { ForgotResult, ResetInput, SignInInput, SignUpInput, SignUpResult } from '../service'
import type { GlobeIntro } from '../../globe/GlobeView'
import { PORT_WINDOWS, portholeFraming, type AuthView } from './porthole'
import ForgotPasswordForm from './ForgotPasswordForm'
import ResetPasswordForm from './ResetPasswordForm'
import SignInForm from './SignInForm'
import SignUpForm from './SignUpForm'
import './auth.css'

type Props = {
  /** Signed in: the form fades out while the window opens up into the home screen. */
  leaving: boolean
  onSignIn: (input: SignInInput) => Promise<void>
  onSignUp: (input: SignUpInput) => Promise<SignUpResult>
  onForgotPassword: (email: string) => Promise<ForgotResult>
  onResetPassword: (input: ResetInput) => Promise<void>
  /** Where the globe should sit to fill this window (GlobeView's `intro`). */
  onFrame: (frame: GlobeIntro) => void
}

const RIVETS = ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l']

const TITLES: Record<AuthView, string> = {
  signin: 'Sign in',
  signup: 'Create an account',
  forgot: 'Reset your password',
  reset: 'Choose a new password',
}

const VERIFIED: Record<string, { text: string; ok: boolean }> = {
  '1': { text: 'Email confirmed. Sign in to start.', ok: true },
  expired: { text: 'That link has expired. Sign in and we’ll send you a new one.', ok: false },
  invalid: { text: 'That link doesn’t work anymore. Sign in to get a new one.', ok: false },
}

const RESET_FAILED: Record<string, { text: string; ok: boolean }> = {
  expired: { text: 'That reset link has expired. Ask for a new one below.', ok: false },
  invalid: { text: 'That reset link doesn’t work anymore. Ask for a new one below.', ok: false },
}

/**
 * ?verified=… is where the email confirmation link lands, and ?reset=… where the password one
 * does, carrying either a word from RESET_FAILED or the single-use token itself. Both are read
 * once per page load and taken straight out of the address bar, so a token isn't left in history
 * or in a link the person might share.
 */
const landing = (() => {
  const url = new URL(location.href)
  const verified = url.searchParams.get('verified')
  const reset = url.searchParams.get('reset')
  if (verified === null && reset === null) return { notice: null, resetToken: null }
  url.searchParams.delete('verified')
  url.searchParams.delete('reset')
  history.replaceState(null, '', url.pathname + url.search + url.hash)
  const failed = reset === null ? undefined : RESET_FAILED[reset]
  const confirmed = verified === null ? undefined : VERIFIED[verified]
  return {
    notice: confirmed ?? failed ?? null,
    // anything in ?reset= that isn't one of the two failure words is the token itself
    resetToken: reset !== null && !failed ? reset : null,
  }
})()

// The globe itself is the app's GlobeView behind this screen, clipped to the porthole window
// (see auth.css), so the same globe carries on into the home screen after signing in.
export default function AuthScreen({ leaving, onSignIn, onSignUp, onForgotPassword, onResetPassword, onFrame }: Props) {
  // a reset link brings its own view; everything else starts at sign-in
  const [view, setView] = useState<AuthView>(landing.resetToken ? 'reset' : 'signin')
  const [switched, setSwitched] = useState(false)
  const [notice, setNotice] = useState(landing.notice)
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
    if (next !== 'signin') setNotice(null) // a notice is about the form you're leaving
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

      <section className="auth-side" aria-label={TITLES[view]}>
        <div className="auth-column">
          <div className="auth-brand">
            <img src={logo} alt="" />
            <span>Memoir</span>
          </div>
          {view === 'signin' && <SignInForm key="signin" onSubmit={onSignIn} onForgot={() => switchTo('forgot')} notice={notice} autoFocus={switched} />}
          {view === 'signup' && <SignUpForm key="signup" onSubmit={onSignUp} autoFocus={switched} />}
          {view === 'forgot' && <ForgotPasswordForm key="forgot" onSubmit={onForgotPassword} onBack={() => switchTo('signin')} autoFocus={switched} />}
          {view === 'reset' && landing.resetToken && (
            <ResetPasswordForm
              key="reset"
              token={landing.resetToken}
              onSubmit={onResetPassword}
              onDone={() => {
                setNotice({ text: 'Password changed. Sign in with the new one.', ok: true })
                switchTo('signin')
              }}
              onBack={() => switchTo('signin')}
            />
          )}
          {/* the reset forms carry their own way back, so this line is only for the two main ones */}
          {(view === 'signin' || view === 'signup') && (
            <p className="auth-switch">
              {view === 'signin' ? 'New to the cabin? ' : 'Already aboard? '}
              <button type="button" onClick={() => switchTo(view === 'signin' ? 'signup' : 'signin')}>
                {view === 'signin' ? 'Create an account' : 'Sign in'}
              </button>
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
