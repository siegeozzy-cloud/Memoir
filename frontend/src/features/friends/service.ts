import { api } from '../../shared/lib/api'
import type { User } from '../../shared/types'

// Friends: find people by name or unique ID, ask to be friends, accept or decline.
// You can only message, call or tag people who have accepted.

/** How you stand with someone found by a search. */
export type Relation = 'none' | 'sent' | 'received' | 'friend'

export type SearchResult = {
  user: User
  /** Only sent back when their exact ID was searched for. */
  uniqueId?: string
  relation: Relation
}

export type FriendRequest = { id: string; user: User; at: string }

export const friendsApi = {
  search: async (q: string) => (await api<{ results: SearchResult[] }>(`/friends/search?q=${encodeURIComponent(q)}`)).results,
  requests: () => api<{ incoming: FriendRequest[]; outgoing: FriendRequest[] }>('/friends/requests'),
  /** Asks to be friends; accepts instead when they'd already asked you. */
  add: (userId: string) => api<{ status: 'sent' | 'friend' }>('/friends/requests', { method: 'POST', json: { userId } }),
  accept: (requestId: string) => api<{ status: 'friend' }>(`/friends/requests/${requestId}/accept`, { method: 'POST' }),
  /** Declines one sent to you, or cancels one you sent. */
  dismiss: (requestId: string) => api(`/friends/requests/${requestId}`, { method: 'DELETE' }),
  unfriend: (userId: string) => api(`/friends/${userId}`, { method: 'DELETE' }),
}
