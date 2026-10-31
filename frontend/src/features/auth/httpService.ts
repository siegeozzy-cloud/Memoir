import { api, ApiError } from '../../shared/lib/api'
import { AuthError, type AuthService, type Session, type SignUpResult } from './service'

// The real accounts backend (../backend, /api/auth).

const FIELDS = ['name', 'email', 'password', 'acceptedTerms'] as const

/** Backend errors become form errors, pointing at their input when there is one. */
async function asAuthError<T>(call: Promise<T>): Promise<T> {
  try {
    return await call
  } catch (e) {
    if (!(e instanceof ApiError)) throw e
    const field = FIELDS.find((f) => f === e.field)
    throw new AuthError(e.message, field)
  }
}

export const httpAuthService: AuthService = {
  async restore() {
    return (await api<{ session: Session | null }>('/auth/session')).session
  },
  signIn: (input) => asAuthError(api<Session>('/auth/signin', { method: 'POST', json: input })),
  signUp: (input) => asAuthError(api<SignUpResult>('/auth/signup', { method: 'POST', json: input })),
  signOut: () => api('/auth/signout', { method: 'POST' }),
}
