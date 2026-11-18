import { useCallback, useEffect, useState } from 'react'
import type { AuthService, Session, SignInInput, SignUpInput } from './service'

const RESTORE_TIMEOUT_MS = 6000

/**
 * The signed-in session, kept in sync with an AuthService. `session` is undefined while the earlier
 * session is being checked, then a Session or null. Sign-in errors are thrown to the form.
 */
export function useAuth(service: AuthService) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    // Nothing shows until this answers, so a server that never replies mustn't hold the app on a
    // black screen: after a few seconds, show the sign-in screen (a real answer still wins if it comes).
    const timeout = setTimeout(() => !cancelled && setSession((s) => (s === undefined ? null : s)), RESTORE_TIMEOUT_MS)
    service.restore().finally(() => clearTimeout(timeout)).then(
      (s) => !cancelled && setSession(s),
      () => !cancelled && setSession(null), // server unreachable: the sign-in form says so when used
    )
    return () => {
      cancelled = true
    }
  }, [service])

  const signIn = useCallback(
    async (input: SignInInput) => {
      setSession(await service.signIn(input))
    },
    [service],
  )

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const result = await service.signUp(input)
      if (result.status === 'signed-in') setSession(result.session)
      return result
    },
    [service],
  )

  const signOut = useCallback(async () => {
    await service.signOut()
    setSession(null)
  }, [service])

  return { session, signIn, signUp, signOut }
}
