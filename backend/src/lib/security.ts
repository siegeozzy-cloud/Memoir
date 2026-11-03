import type { FastifyInstance } from 'fastify'
import { config } from '../config.ts'

/**
 * The headers that go on every answer this server gives — JSON, a redirect out of an email link, an
 * uploaded photo from /api/files, or an error.
 *
 * The web app has its own, much larger policy (see frontend/security-headers.js): it is the thing a
 * browser actually renders. What is here is about this origin. An API answer is never a page, so its
 * policy can be the strictest one there is: load nothing, frame nothing, be framed by nobody. If a
 * reflected value ever did come back from here as HTML, there would be nothing for it to run.
 */

/**
 * `default-src 'none'` covers scripts, styles, frames, fonts, connections — everything. Pictures and
 * videos are allowed because /api/files serves them from this origin in development, and a browser
 * applies the *image's own* policy to nothing else.
 */
const API_CSP = [
  "default-src 'none'",
  "img-src 'self' data:",
  "media-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  // clickjacking: no page on any site may put an API answer in a frame
  "frame-ancestors 'none'",
].join('; ')

/**
 * Permissions the API never needs. The web app's own policy is the one that grants the camera and
 * microphone for calls; this origin has no use for any of it.
 */
const API_PERMISSIONS = ['accelerometer=()', 'camera=()', 'display-capture=()', 'geolocation=()', 'microphone=()', 'payment=()', 'usb=()'].join(', ')

export function registerSecurityHeaders(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Content-Security-Policy', API_CSP)
    // the older header some browsers still prefer for framing; same answer as frame-ancestors above
    reply.header('X-Frame-Options', 'DENY')
    // a .jpg stays a .jpg, whatever a browser might otherwise guess the bytes to be
    reply.header('X-Content-Type-Options', 'nosniff')
    // don't pass the page someone came from — a reset link is in an address
    reply.header('Referrer-Policy', 'no-referrer')
    reply.header('Permissions-Policy', API_PERMISSIONS)
    // a window this origin opens, or that opens it, can't reach into it
    reply.header('Cross-Origin-Opener-Policy', 'same-origin')
    // but the app, on its own address, must still be able to show pictures served from here
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin')
    reply.header('X-Permitted-Cross-Domain-Policies', 'none')
    // In production everything is over TLS, so tell the browser never to try this host over http
    // again. Left off in development, where the server is plain http on a loopback address.
    if (!config.dev && req.protocol === 'https') reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  })
}
