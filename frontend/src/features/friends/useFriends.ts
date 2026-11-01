import { useCallback, useEffect, useState } from 'react'
import { onChannel } from '../../shared/lib/socket'
import { friendsApi, type FriendRequest } from './service'

/** Friend requests waiting for you and the ones you've sent, kept in step with the server. */
const NONE: FriendRequest[] = []

export function useFriends(signedIn: boolean) {
  const [requests, setRequests] = useState<{ incoming: FriendRequest[]; outgoing: FriendRequest[] } | null>(null)

  const reload = useCallback(async () => {
    if (!signedIn) return
    const r = await friendsApi.requests().catch(() => null)
    if (r) setRequests(r)
  }, [signedIn])

  useEffect(() => {
    if (!signedIn) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async: the lists are set after the request
    void reload()
    // someone added, accepted or cancelled: reload the lists
    return onChannel('friends', () => void reload())
  }, [signedIn, reload])

  // signed out, nothing to show (and nothing kept from the person before)
  return { incoming: (signedIn && requests?.incoming) || NONE, outgoing: (signedIn && requests?.outgoing) || NONE, reload }
}

export type FriendsApi = ReturnType<typeof useFriends>
