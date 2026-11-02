import { useId, useState, type FormEvent } from 'react'
import { AuthError, type ForgotResult } from '../service'
import { Field } from './fields'
import { ArrowRightIcon, MailIcon } from './icons'

type Props = {
  onSubmit: (email: string) => Promise<ForgotResult>
  onBack: () => void
  autoFocus?: boolean
}

/**
 * Step one of a reset: the address to send the link to. The answer is the same whether or not that
 * address has an account — the server won't say, so neither does this.
 */
export default function ForgotPasswordForm({ onSubmit, onBack, autoFocus }: Props) {
  const id = useId()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)
  const [sent, setSent] = useState<ForgotResult | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      setSent(await onSubmit(email))
    } catch (err) {
      setError(err instanceof AuthError ? err : new AuthError('Something went wrong. Try again.'))
    }
    setBusy(false)
  }

  return (
    <form className="auth-card" onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <p className="auth-eyebrow">Cabin access · Lost key</p>
      <h1 className="auth-title" id={`${id}-title`}>
        Can’t remember your password?
      </h1>
      <p className="auth-sub">Tell us the address on the account and we’ll send a link to set a new one.</p>

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
        disabled={!!sent}
        autoFocus={autoFocus}
      />

      {error && (
        <p className="auth-error" role="alert">
          {error.message}
        </p>
      )}
      {sent && (
        <p className="auth-note is-ok" role="status">
          {sent.delivery === 'console'
            ? 'No mail server is set up, so the link is printed in the backend’s terminal. Open it there to choose a new password.'
            : `If ${sent.email} has an account, a link is on its way. It works for one hour.`}
        </p>
      )}

      {!sent && (
        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send the link'}
          <ArrowRightIcon />
        </button>
      )}
      <p className="auth-switch">
        <button type="button" onClick={onBack}>
          Back to sign in
        </button>
      </p>
    </form>
  )
}
