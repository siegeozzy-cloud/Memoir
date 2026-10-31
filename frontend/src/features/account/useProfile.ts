import { useCallback, useEffect, useState } from 'react'
import type { AccountService, Profile, ProfilePatch } from './service'

/** The signed-in person's profile, kept in sync with an AccountService. Null until it loads, and while signed out. */
export function useProfile(service: AccountService, signedIn: boolean) {
  const [loaded, setLoaded] = useState<Profile | null>(null)

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    service.load().then((p) => {
      if (!cancelled) setLoaded(p)
    })
    return () => {
      cancelled = true
    }
  }, [service, signedIn])

  /**
   * Name, status and notification changes show at once (and go back if the server refuses them, with
   * the error thrown to the caller); a new picture shows once it's processed.
   */
  const update = useCallback(
    async (patch: ProfilePatch) => {
      let before: Profile | null = null
      setLoaded((p) => (before = p) &&
        p && {
          ...p,
          user: { ...p.user, ...(patch.name?.trim() ? { name: patch.name.trim() } : {}), ...(patch.status ? { status: patch.status } : {}) },
          notifications: { ...p.notifications, ...patch.notifications },
        },
      )
      try {
        setLoaded(await service.update(patch))
      } catch (e) {
        setLoaded(before)
        throw e
      }
    },
    [service],
  )

  const deactivate = useCallback(() => service.deactivate(), [service])
  const remove = useCallback(() => service.remove(), [service])

  return { profile: signedIn ? loaded : null, update, deactivate, remove }
}

export type ProfileApi = ReturnType<typeof useProfile>
