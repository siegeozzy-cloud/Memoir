import { and, eq, gt } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { config } from '../config.ts'
import { db } from '../db/client.ts'
import { sessions, users, type UserRow } from '../db/schema.ts'
import { hashToken, newToken } from './crypto.ts'
import { HttpError } from './errors.ts'

// Sessions live in an httpOnly cookie that scripts can't read. "Keep me signed in" makes it last
// 30 days across browser restarts; otherwise it ends with the browser session (and after a day at most).

export const SESSION_COOKIE = 'memoir_session'
const DAY = 24 * 60 * 60 * 1000
const LONG = 30 * DAY

declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in user, when the request has a valid session. */
    auth: { sessionId: string; user: UserRow } | null
  }
}

const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: !config.dev, path: '/' } as const

export async function startSession(reply: FastifyReply, userId: string, remember: boolean) {
  const token = newToken()
  await db.insert(sessions).values({ id: hashToken(token), userId, remember, expiresAt: new Date(Date.now() + (remember ? LONG : DAY)) })
  reply.setCookie(SESSION_COOKIE, token, { ...cookieOptions, ...(remember ? { maxAge: LONG / 1000 } : {}) })
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

export function registerSessions(app: FastifyInstance) {
  app.decorateRequest('auth', null)
  app.addHook('onRequest', async (req) => {
    const token = req.cookies[SESSION_COOKIE]
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
