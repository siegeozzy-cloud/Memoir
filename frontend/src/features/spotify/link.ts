import { api } from '../../shared/lib/api'

// Linking a Spotify account. The backend runs the sign-in with Spotify and keeps the tokens
// (encrypted, never sent to the browser); the app only learns whether an account is linked.

type LinkStatus = { configured: boolean; linked: boolean; displayName: string | null }

export const linkStatus = () => api<LinkStatus>('/spotify/status')

/** Off to Spotify's consent page; the backend brings the browser back with ?spotify=<result>. */
export const connect = () => location.assign('/api/spotify/connect')

export const unlink = () => api('/spotify', { method: 'DELETE' })

const RESULTS: Record<string, string> = {
  linked: 'Spotify linked. What you play shows at the top.',
  denied: 'Spotify access wasn’t allowed.',
  error: 'Couldn’t link Spotify. Try again.',
  unavailable: 'Spotify isn’t set up on the server yet.',
}

/** The message for a ?spotify=… the backend left after linking (read once, then removed from the address bar). */
export function takeLinkResult(): string | null {
  const url = new URL(location.href)
  const result = url.searchParams.get('spotify')
  if (!result) return null
  url.searchParams.delete('spotify')
  history.replaceState(null, '', url.pathname + url.search + url.hash)
  return RESULTS[result] ?? null
}
