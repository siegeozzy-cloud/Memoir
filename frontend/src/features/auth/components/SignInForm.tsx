import { useId, useState, type FormEvent } from 'react'
import { AuthError, type SignInInput } from '../service'
import { Check, Field, PasswordField } from './fields'
import { ArrowRightIcon, MailIcon } from './icons'

type Props = {
  onSubmit: (input: SignInInput) => Promise<void>
  /** e.g. the result of opening the email confirmation link. */
  notice?: { text: string; ok: boolean } | null
  /** Focus the first field (after switching from the other form). */
  autoFocus?: boolean
}

export default function SignInForm({ onSubmit, notice, autoFocus }: Props) {
  const id = useId()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
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
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-invalid={error?.field === 'email' || undefined}
        autoFocus={autoFocus}
      />
      <PasswordField
        id={`${id}-password`}
        label="Password"
        autoComplete="current-password"
        placeholder="Enter your password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-invalid={error?.field === 'password' || undefined}
      />

      <div className="auth-row">
        <Check checked={remember} onChange={(e) => setRemember(e.target.checked)}>
          Keep me signed in
        </Check>
        {/* TODO: password reset (the backend emails a reset link) */}
        <button type="button" className="auth-link">
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
