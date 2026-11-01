// Calls to the Memoir backend (../backend).
//
// In development the app and the API share an address (Vite proxies /api), and the session is an
// httpOnly cookie the browser sends by itself. Once they're on different addresses, VITE_API_URL points
// here and the session token is sent instead, because a browser won't carry that cookie between sites.

import { clearToken, sessionToken } from './session-token'

/** Empty in development: /api goes through the dev server's proxy. */
const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/** Where the API lives, for the WebSocket and for links out to it (Spotify's sign-in). */
export const apiUrl = (path: string) => `${base}/api${path}`

/** The backend's error: `message` is written to be shown as is; `field` names the form input it's about. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly field?: string

  constructor(status: number, code: string, message: string, field?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.field = field
  }
}

type Options = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; json?: unknown; form?: FormData }

export async function api<T = unknown>(path: string, { method = 'GET', json, form }: Options = {}): Promise<T> {
  const token = sessionToken()
  const headers: Record<string, string> = {}
  if (json !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let r: Response
  try {
    r = await fetch(apiUrl(path), {
      method,
      credentials: base ? 'include' : 'same-origin',
      headers,
      body: json !== undefined ? JSON.stringify(json) : form,
    })
  } catch {
    throw new ApiError(0, 'offline', 'Can’t reach Memoir. Check your connection and try again.')
  }
  // the session has gone (expired, or signed out elsewhere): stop sending the old token
  if (r.status === 401 && token) clearToken()
  if (r.status === 204) return undefined as T
  const body = await r.json().catch(() => null)
  if (!r.ok) {
    const e = body?.error
    // the dev proxy answers 5xx without a body when the backend isn't running
    if (!e) throw new ApiError(r.status, 'unavailable', 'Memoir’s server isn’t answering. Try again in a moment.')
    throw new ApiError(r.status, e.code, e.message, e.field)
  }
  return body as T
}
