// Calls to the Memoir backend (../backend), under /api on the same origin.
// The session is an httpOnly cookie the browser sends by itself; this code never sees it.

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
  let r: Response
  try {
    r = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: json !== undefined ? JSON.stringify(json) : form,
    })
  } catch {
    throw new ApiError(0, 'offline', 'Can’t reach Memoir. Check your connection and try again.')
  }
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
