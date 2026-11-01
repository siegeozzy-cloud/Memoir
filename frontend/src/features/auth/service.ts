import type { User } from '../../shared/types'

/**
 * Who's signed in. The session is an httpOnly cookie when the app and the API share an address;
 * otherwise sign-in hands back `token`, which the app keeps and sends with each call.
 */
export type Session = {
  user: User
  email: string
  token?: string
}

export type SignInInput = { email: string; password: string; remember: boolean }
export type SignUpInput = { name: string; email: string; password: string; acceptedTerms: boolean }

/**
 * Sign-up either signs straight in, or waits until the person opens the link emailed to them;
 * that link is what proves the address exists and is theirs.
 */
export type SignUpResult =
  | { status: 'signed-in'; session: Session }
  /** `delivery: 'console'` means the server has no mail set up and printed the link in its terminal. */
  | { status: 'verify-email'; email: string; delivery?: 'email' | 'console' }

/** A message to show on the form, e.g. "Wrong email or password". `field` points at the input it's about. */
export class AuthError extends Error {
  readonly field?: 'name' | 'email' | 'password' | 'acceptedTerms'

  constructor(message: string, field?: AuthError['field']) {
    super(message)
    this.name = 'AuthError'
    this.field = field
  }
}

/**
 * Everything the app needs from the accounts backend: `httpAuthService` talks to ../backend,
 * `mockAuthService` stands in without it. The server owns the real checks (validation, Argon2id password
 * hashes, rate limits, email confirmation) and keeps the session in an httpOnly cookie.
 */
export interface AuthService {
  /** The session from an earlier visit, if it's still there. */
  restore(): Promise<Session | null>
  signIn(input: SignInInput): Promise<Session>
  signUp(input: SignUpInput): Promise<SignUpResult>
  signOut(): Promise<void>
}
