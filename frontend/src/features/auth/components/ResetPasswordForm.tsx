import { useId, useState, type FormEvent } from 'react'
import { AuthError, type ResetInput } from '../service'
import { PasswordField } from './fields'
import { ArrowRightIcon } from './icons'
import { passwordStrength } from './strength'

type Props = {
  /** The single-use token the emailed link carried back. */
  token: string
  onSubmit: (input: ResetInput) => Promise<void>
  /** Done: the sign-in form takes over, with a note saying so. */
  onDone: () => void
  onBack: () => void
}

/**
 * Step two: the new password, from the link in the email. The two boxes are compared here rather
 * than at the server — a typo in the second one isn't the server's business.
 */
export default function ResetPasswordForm({ token, onSubmit, onDone, onBack }: Props) {
  const id = useId()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)
  const strength = passwordStrength(password)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (password !== confirm) {
      setError(new AuthError('Those two passwords don’t match.', 'confirm'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ token, password })
      onDone()
    } catch (err) {
      setError(err instanceof AuthError ? err : new AuthError('Something went wrong. Try again.'))
      setBusy(false)
    }
  }

  return (
    <form className="auth-card" onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <p className="auth-eyebrow">Cabin access · New key</p>
      <h1 className="auth-title" id={`${id}-title`}>
        Choose a new password
      </h1>
      <p className="auth-sub">This signs you out anywhere else you were signed in.</p>

      <PasswordField
        id={`${id}-password`}
        label="New password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-invalid={error?.field === 'password' || undefined}
        aria-describedby={`${id}-strength`}
        autoFocus
      />
      <div className={`auth-meter is-${strength.score}`} id={`${id}-strength`}>
        <span className="auth-meter-bars" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="auth-meter-label">
          <span className="sr-only">Password strength: </span>
          {strength.label}
        </span>
      </div>
      <PasswordField
        id={`${id}-confirm`}
        label="Confirm new password"
        autoComplete="new-password"
        placeholder="Type it once more"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        aria-invalid={error?.field === 'confirm' || undefined}
      />

      {error && (
        <p className="auth-error" role="alert">
          {error.message}
        </p>
      )}
      <button type="submit" className="auth-submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save and sign in'}
        <ArrowRightIcon />
      </button>
      <p className="auth-switch">
        <button type="button" onClick={onBack}>
          Back to sign in
        </button>
      </p>
    </form>
  )
}
