// The web app's security headers — one source for both places they're served from:
//
//   - development: vite.config.ts puts them on every response from the dev server
//   - production:  vercel.json repeats them, because a host sets headers before any build runs
//
// vite.config.ts checks the two against each other at build time, so vercel.json can't quietly drift
// out of date. If a build fails saying they disagree, copy the printed value into vercel.json.
//
// What the Content-Security-Policy is for: a browser will only load a script, a style, a font, a
// picture or a connection from somewhere this list names. An injected `<script>`, an `onerror=` on a
// broken image, a `javascript:` address — none of them have anywhere to run, because nothing inline
// is allowed to. `frame-ancestors` is the clickjacking half: no other site may put Memoir inside a
// frame and lay its own buttons over the top.

/**
 * Where the API lives in production — the app and the API are two different sites (see docs/deploy.md),
 * so the browser has to be told it may talk to that one. `wss:` is the same host, for the live
 * connection behind messages, presence and calls.
 *
 * **Change this if your API is somewhere else**, and change `vercel.json` to match. It is the value
 * `VITE_API_URL` is set to on Vercel.
 */
export const API_ORIGIN = 'https://memoir-api-zm7v.onrender.com'
const API_SOCKET = API_ORIGIN.replace(/^http/, 'ws')

const GOOGLE_FONT_CSS = 'https://fonts.googleapis.com'
const GOOGLE_FONT_FILES = 'https://fonts.gstatic.com'
/** Photos and videos once CLOUDINARY_URL is set on the backend. */
const CLOUDINARY = 'https://res.cloudinary.com'
/** Album art on Now Playing comes straight from Spotify's own picture hosts. */
const SPOTIFY_ART = ['https://*.scdn.co', 'https://*.spotifycdn.com']
/** Lyrics, fetched by the app itself (src/features/spotify/lyrics.ts). */
const LYRICS = 'https://lrclib.net'
/** three.js and maplibre-gl, loaded by the globe page. */
const CDN = 'https://cdn.jsdelivr.net'
/** The globe's street-level vector tiles, sprites and glyphs. */
const TILES = 'https://tiles.openfreemap.org'

const join = (directives: (string | null)[]) => directives.filter(Boolean).join('; ')

/**
 * The app itself: React, built by vite into ordinary module scripts, so no inline script is ever
 * needed and `script-src 'self'` can stand on its own. Inline *styles* are allowed because React
 * writes `style=` attributes for the globe framing and the chat themes.
 *
 * In development vite serves an inline module preamble for hot reloading, and talks to itself over a
 * websocket, so those two are let through there and nowhere else.
 */
export function appCsp({ dev }: { dev: boolean }) {
  return join([
    "default-src 'self'",
    dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    `style-src 'self' 'unsafe-inline' ${GOOGLE_FONT_CSS}`,
    `font-src 'self' ${GOOGLE_FONT_FILES}`,
    `img-src 'self' data: blob: ${API_ORIGIN} ${CLOUDINARY} ${SPOTIFY_ART.join(' ')}`,
    `media-src 'self' blob: ${API_ORIGIN} ${CLOUDINARY}`,
    `connect-src 'self' ${API_ORIGIN} ${API_SOCKET} ${LYRICS}${dev ? ' ws: wss:' : ''}`,
    // the globe is a page of this app's own, in a same-origin frame
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    // clickjacking: only Memoir may frame Memoir
    "frame-ancestors 'self'",
    dev ? null : 'upgrade-insecure-requests',
  ])
}

/**
 * public/globe/index.html, which the app shows in a frame. It is one long inline script by design, and
 * it pulls three.js and maplibre-gl off a CDN, so it needs a looser script rule than the app — which
 * is exactly why it gets its own policy instead of loosening the app's. Everything else stays shut:
 * it may reach the tile host and nothing more, and it can still only be framed by Memoir.
 */
export function globeCsp({ dev }: { dev: boolean }) {
  return join([
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' ${CDN}`,
    `style-src 'self' 'unsafe-inline' ${GOOGLE_FONT_CSS}`,
    `font-src 'self' ${GOOGLE_FONT_FILES}`,
    `img-src 'self' data: blob: ${TILES}`,
    `connect-src 'self' ${TILES}${dev ? ' ws: wss:' : ''}`,
    // maplibre-gl runs its tile decoding in a worker it builds from a blob
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
    dev ? null : 'upgrade-insecure-requests',
  ])
}

/** Everything but the CSP, which differs by path. Same on every response. */
export function commonHeaders({ dev }: { dev: boolean }): Record<string, string> {
  return {
    // the older framing header, for browsers that still prefer it to frame-ancestors
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // calls need the camera and microphone, on this site only; nothing else is asked for
    'Permissions-Policy': 'accelerometer=(), camera=(self), display-capture=(self), geolocation=(), microphone=(self), payment=(), usb=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    ...(dev ? {} : { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains' }),
  }
}

/** True for the globe page and its assets, which get the looser policy above. */
export const isGlobePath = (pathname: string) => pathname === '/globe' || pathname.startsWith('/globe/')
