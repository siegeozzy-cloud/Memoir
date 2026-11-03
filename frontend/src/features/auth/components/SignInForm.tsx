import { useId, useState, type FormEvent } from 'react'
import { AuthError, type SignInInput } from '../service'
import { BLOCKED, cleanEmail, cleanPassword, emailProblem, passwordProblem, type Cleaned } from '../validation'
import { Check, Field, PasswordField } from './fields'
import { ArrowRightIcon, MailIcon } from './icons'

type Props = {
  onSubmit: (input: SignInInput) => Promise<void>
  /** The 'Forgot password?' link; the screen swaps this form for the reset one. */
  onForgot: () => void
  /** e.g. the result of opening the email confirmation link. */
  notice?: { text: string; ok: boolean } | null
  /** Focus the first field (after switching from the other form). */
  autoFocus?: boolean
}

export default function SignInForm({ onSubmit, onForgot, notice, autoFocus }: Props) {
  const id = useId()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)

  /** Keeps a box to the characters its field allows, and says so the moment one is refused. */
  const typed = (field: 'email' | 'password', raw: string, clean: (raw: string) => Cleaned, set: (v: string) => void) => {
    const { value, blocked } = clean(raw)
    set(value)
    if (blocked) setError(new AuthError(BLOCKED[field], field))
    else if (error?.field === field) setError(null)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    // checked here as well as at the server, so a typo doesn't cost a round trip or a rate-limit try
    const problem =
      (emailProblem(email) && new AuthError(emailProblem(email)!, 'email')) ||
      (passwordProblem(password, { existing: true }) && new AuthError(passwordProblem(password, { existing: true })!, 'password'))
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ email, password, remember })
      // signed in: this screen is on its way out, so the button stays busy
    } catch (err) {
      setError(err instanceof AuthError ? err : new AuthError('Something went wrong. Try again.'))
      setBusy(false)
    }
  }

  return (
    <form className="auth-card" onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <p className="auth-eyebrow">Cabin access</p>
      <h1 className="auth-title" id={`${id}-title`}>
        Welcome back aboard
      </h1>
      <p className="auth-sub">Make your memories in one place.</p>
      {notice && !error && (
        <p className={`auth-note${notice.ok ? ' is-ok' : ''}`} role="status">
          {notice.text}
        </p>
      )}

      <Field
        id={`${id}-email`}
        label="Email"
        icon={<MailIcon />}
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="off"
        spellCheck={false}
        placeholder="you@example.com"
        maxLength={254}
        value={email}
        onChange={(e) => typed('email', e.target.value, cleanEmail, setEmail)}
        aria-invalid={error?.field === 'email' || undefined}
        autoFocus={autoFocus}
      />
      <PasswordField
        id={`${id}-password`}
        label="Password"
        autoComplete="current-password"
        placeholder="Enter your password"
        maxLength={128}
        value={password}
        onChange={(e) => typed('password', e.target.value, cleanPassword, setPassword)}
        aria-invalid={error?.field === 'password' || undefined}
      />

      <div className="auth-row">
        <Check checked={remember} onChange={(e) => setRemember(e.target.checked)}>
          Keep me signed in
        </Check>
        <button type="button" className="auth-link" onClick={onForgot}>
          Forgot password?
        </button>
      </div>

      {error && (
        <p className="auth-error" role="alert">
          {error.message}
        </p>
      )}
      <button type="submit" className="auth-submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
        <ArrowRightIcon />
      </button>
    </form>
  )
}
