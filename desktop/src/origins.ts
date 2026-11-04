/**
 * Where this window is allowed to go, and what it may ask the operating system for.
 *
 * This is the whole security story of the desktop app. It loads the hosted web app rather than a
 * copy of its own, so there is no `file://` page, no Node in the renderer and no preload bridge —
 * the window is a browser pointed at one site. What stops it being a *general* browser is the list
 * below: a navigation to anywhere else is handed to the real browser instead, and the camera and
 * microphone are only ever offered to Memoir itself.
 *
 * `MEMOIR_APP_URL` points it somewhere else for development (`npm run dev` uses the Vite server).
 * The API's address is only needed because of the round trip described under SPOTIFY below.
 */

/** The web app. Must match `APP_URL` on the server, which is where it sends people back to. */
export const APP_URL = (process.env.MEMOIR_APP_URL || 'https://memoir-album.vercel.app').replace(/\/$/, '')

/**
 * The API. Must match `VITE_API_URL` in the deployed web app and `API_ORIGIN` in
 * frontend/security-headers.ts — if the API ever moves, this is a fourth place that has to say so.
 */
export const API_URL = (process.env.MEMOIR_API_URL || 'https://memoir-api-zm7v.onrender.com').replace(/\/$/, '')

const origin = (url: string) => new URL(url).origin

export const APP_ORIGIN = origin(APP_URL)
export const API_ORIGIN = origin(API_URL)

/**
 * SPOTIFY. Linking an account is a plain navigation, not a popup: the web app sends the window to
 * Spotify's consent page, Spotify sends it back to the API's `/api/spotify/callback`, and that
 * redirects to the web app with `?spotify=linked`. So three origins take part in one click, and all
 * three have to be allowed to load in this window or the link can never be completed.
 *
 * `accounts.spotify.com` is the consent page; `*.spotify.com` covers the sign-in it may bounce
 * through first.
 */
const SPOTIFY_HOSTS = ['accounts.spotify.com', 'www.spotify.com', 'spotify.com']

/** In development the app and the API share the Vite server's address, so this is usually one entry. */
const ALLOWED_ORIGINS = new Set([APP_ORIGIN, API_ORIGIN])

/** Whether this window may navigate to `url` itself, rather than handing it to the real browser. */
export function mayNavigateTo(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (ALLOWED_ORIGINS.has(parsed.origin)) return true
  // Spotify's own pages, over TLS only — an http: lookalike is not the real thing
  return parsed.protocol === 'https:' && SPOTIFY_HOSTS.includes(parsed.hostname)
}

/** Whether a page asking for the camera, the microphone and so on is Memoir itself. */
export const isApp = (url: string | undefined) => {
  if (!url) return false
  try {
    return new URL(url).origin === APP_ORIGIN
  } catch {
    return false
  }
}

/**
 * What the app is allowed to ask for, and nothing else.
 *
 * `media` is the camera and microphone, for calls — the one permission Memoir genuinely needs.
 * `notifications` is granted so that the day the web app starts raising them, the desktop app shows
 * them without a change here; it raises none today. Everything absent from this list is refused
 * without a prompt: no geolocation, no MIDI, no USB, no screen capture, no pointer lock.
 */
export const ALLOWED_PERMISSIONS = new Set(['media', 'notifications', 'clipboard-sanitized-write'])
