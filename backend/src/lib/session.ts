import { and, eq, gt } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config.ts'
import { db } from '../db/client.ts'
import { sessions, users, type UserRow } from '../db/schema.ts'
import { hashToken, newToken } from './crypto.ts'
import { HttpError } from './errors.ts'

/**
 * A session is a random token the server keeps only as a SHA-256, so a leak of the database hands out
 * nothing. It reaches the server two ways:
 *
 * - as an httpOnly cookie, when the app and the API share an address (development, or a custom domain).
 *   Scripts can't read it, which is the safest arrangement;
 * - as `Authorization: Bearer …`, for clients that can't use that cookie: the web app while it lives on
 *   vercel.app and the API on onrender.com (different sites), the Electron app, and the phone apps.
 *
 * Over a WebSocket, where a browser can't set headers, the token rides in the sub-protocol instead.
 *
 * "Keep me signed in" makes it last 30 days; otherwise it ends with the browser, and within a day.
 */

export const SESSION_COOKIE = 'memoir_session'
const PROTOCOL = 'memoir.v1'
const TOKEN_PROTOCOL = 'memoir.token.'
const DAY = 24 * 60 * 60 * 1000
const LONG = 30 * DAY

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in user, when the request has a valid session. */
    auth: { sessionId: string; user: UserRow } | null
  }
}

const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: !config.dev, path: '/' } as const

/** Starts a session: sets the cookie, and returns the token for clients that need to send it themselves. */
export async function startSession(reply: FastifyReply, userId: string, remember: boolean) {
  const token = newToken()
  await db.insert(sessions).values({ id: hashToken(token), userId, remember, expiresAt: new Date(Date.now() + (remember ? LONG : DAY)) })
  reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, ...(remember ? { maxAge: LONG / 1000 } : {}) })
  return token
}

export async function endSession(req: FastifyRequest, reply: FastifyReply) {
  if (req.auth) await db.delete(sessions).where(eq(sessions.id, req.auth.sessionId))
  reply.clearCookie(SESSION_COOKIE, cookieOptions)
}

/** Signs a user out everywhere (deactivate, delete). */
export async function endAllSessions(userId: string, reply: FastifyReply) {
  await db.delete(sessions).where(eq(sessions.userId, userId))
  reply.clearCookie(SESSION_COOKIE, cookieOptions)
}

/** The sub-protocols a browser offers when it opens the WebSocket; one of them carries the token. */
export const wsProtocols = (token: string) => [PROTOCOL, TOKEN_PROTOCOL + token]
export const chooseProtocol = (offered: Set<string> | string[]) => ([...offered].includes(PROTOCOL) ? PROTOCOL : false)

function tokenOf(req: FastifyRequest) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7).trim()
  const offered = req.headers['sec-websocket-protocol']
  if (typeof offered === 'string') {
    const carrying = offered.split(',').map((p) => p.trim()).find((p) => p.startsWith(TOKEN_PROTOCOL))
    if (carrying) return carrying.slice(TOKEN_PROTOCOL.length)
  }
  return req.cookies[SESSION_COOKIE]
}

export function registerSessions(app: FastifyInstance) {
  app.decorateRequest('auth', null)
  app.addHook('onRequest', async (req) => {
    const token = tokenOf(req)
    if (!token) return
    const id = hashToken(token)
    const [row] = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    if (row) req.auth = { sessionId: id, user: row.user }
  })
}

/** preHandler for routes that need a signed-in user. */
export async function requireAuth(req: FastifyRequest) {
  if (!req.auth) throw new HttpError(401, 'signed-out', 'Sign in to continue.')
}

/** The signed-in user (call after requireAuth). */
export const userOf = (req: FastifyRequest) => req.auth!.user
