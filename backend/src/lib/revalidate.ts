import { createHash } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'

// Lets a browser say "I already have this" and be told so in a couple of hundred bytes, instead of
// being sent the whole list again.
//
// The lists this is used on — your posts, your conversations — change rarely, and every change is
// already pushed down the WebSocket. So a tab that reloads is nearly always asking for something it
// holds already. On a free plan metered by the gigabyte that repeat traffic is worth removing.

/**
 * Answers with the payload and its ETag, or with 304 Not Modified when the browser's copy matches.
 *
 * `private, no-cache` means the browser stores the answer but revalidates before every use, so it can
 * never show a stale list — it only ever skips the download. The tag is a hash of the payload itself,
 * which also makes this safe when two people share a browser: a 304 can only happen when the bytes
 * are identical, and the session is checked on every request regardless, because this runs after
 * `requireAuth`.
 */
export function revalidate<T>(req: FastifyRequest, reply: FastifyReply, payload: T) {
  const body = JSON.stringify(payload)
  const etag = `W/"${createHash('sha1').update(body).digest('base64url')}"`
  reply.header('Cache-Control', 'private, no-cache')
  reply.header('ETag', etag)
  // the answer depends on who is asking, however the session travels
  reply.header('Vary', 'Origin, Authorization, Cookie')

  // a browser may offer several tags, and may weaken one it was given
  const offered = req.headers['if-none-match']?.split(',').map((tag) => tag.trim())
  if (offered?.some((tag) => tag === etag || tag === etag.slice(2))) return reply.code(304).send()
  return payload
}
