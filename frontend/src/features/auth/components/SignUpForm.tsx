import { useId, useState, type FormEvent } from 'react'
import { AuthError, type SignUpInput, type SignUpResult } from '../service'
import { BLOCKED, cleanEmail, cleanName, cleanPassword, emailProblem, nameProblem, passwordProblem, type Cleaned } from '../validation'
import { Check, Field, PasswordField } from './fields'
import { ArrowRightIcon, MailIcon, UserIcon } from './icons'
import { passwordStrength } from './strength'
import TermsDialog from '../../../shared/components/TermsDialog'

type Props = {
  onSubmit: (input: SignUpInput) => Promise<SignUpResult>
  /** Focus the first field (after switching from the other form). */
  autoFocus?: boolean
}

export default function SignUpForm({ onSubmit, autoFocus }: Props) {
  const id = useId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<AuthError | null>(null)
  const [sent, setSent] = useState<{ email: string; delivery?: 'email' | 'console' } | null>(null)
  const [terms, setTerms] = useState(false)
  const strength = passwordStrength(password)

  /** Keeps a box to the characters its field allows, and says so the moment one is refused. */
  const typed = (field: 'name' | 'email' | 'password', raw: string, clean: (raw: string) => Cleaned, set: (v: string) => void) => {
    const { value, blocked } = clean(raw)
    set(value)
    if (blocked) setError(new AuthError(BLOCKED[field], field))
    else if (error?.field === field) setError(null)
  }

  // the server checks every field too, and answers with a message for the one that needs fixing;
  // doing it here first means a typo doesn't cost a round trip or one of the five tries a minute
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    const problem =
      (nameProblem(name) && new AuthError(nameProblem(name)!, 'name')) ||
      (emailProblem(email) && new AuthError(emailProblem(email)!, 'email')) ||
      (passwordProblem(password) && new AuthError(passwordProblem(password)!, 'password')) ||
      (!agreed && new AuthError('Read and agree to the Terms and Agreements to continue.', 'acceptedTerms'))
    if (problem) return setError(problem)
    setBusy(true)
    setError(null)
    try {
      const result = await onSubmit({ name, email, password, acceptedTerms: agreed })
      if (result.status === 'verify-email') {
        setSent({ email: result.email, delivery: result.delivery })
        setBusy(false)
      }
      // signed in: this screen is on its way out, so the button stays busy
    } catch (err) {
      setError(err instanceof AuthError ? err : new AuthError('Something went wrong. Try again.'))
      setBusy(false)
    }
  }

  return (
    <form className="auth-card" onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <p className="auth-eyebrow">New crew · Boarding pass</p>
      <h1 className="auth-title" id={`${id}-title`}>
        Claim your seat by the window
      </h1>
      <p className="auth-sub">Create an account to pin places and keep your own orbit.</p>

      <Field
        id={`${id}-name`}
        label="Full name"
        icon={<UserIcon />}
        autoComplete="name"
        placeholder="Your name"
        maxLength={50}
        value={name}
        onChange={(e) => typed('name', e.target.value, cleanName, setName)}
        aria-invalid={error?.field === 'name' || undefined}
        autoFocus={autoFocus}
      />
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
      />
      <PasswordField
        id={`${id}-password`}
        label="Password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        maxLength={128}
        value={password}
        onChange={(e) => typed('password', e.target.value, cleanPassword, setPassword)}
        aria-invalid={error?.field === 'password' || undefined}
        aria-describedby={`${id}-strength`}
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

      <div className="auth-row is-terms">
        <Check
          checked={agreed}
          onChange={(e) => {
            setAgreed(e.target.checked)
            if (error?.field === 'acceptedTerms') setError(null)
          }}
          aria-invalid={error?.field === 'acceptedTerms' || undefined}
        >
          I agree to the
        </Check>
        <button type="button" className="auth-link is-underlined" onClick={() => setTerms(true)}>
          Terms and Agreements
        </button>
      </div>
      {/* Reading them to the end is what ticks the box, so nobody agrees to something they never saw. */}
      {terms && (
        <TermsDialog
          agreed={agreed}
          onAgree={() => {
            setAgreed(true)
            if (error?.field === 'acceptedTerms') setError(null)
            setTerms(false)
          }}
          onClose={() => setTerms(false)}
        />
      )}

      {error && (
        <p className="auth-error" role="alert">
          {error.message}
        </p>
      )}
      {sent && (
        <p className="auth-note" role="status">
          {sent.delivery === 'console'
            ? 'No mail server is set up, so the confirmation link is printed in the backend’s terminal. Open it there, then sign in.'
            : `Check ${sent.email} for a link to confirm your email, then sign in.`}
        </p>
      )}
      <button type="submit" className="auth-submit" disabled={busy}>
        {busy ? 'Creating account…' : 'Create account'}
        <ArrowRightIcon />
      </button>
    </form>
  )
}
