import { hash, verify } from '@node-rs/argon2'
import { and, eq, gt } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { config } from '../../config.ts'
import { db, isUniqueViolation } from '../../db/client.ts'
import { emailTokens, users, type UserRow } from '../../db/schema.ts'
import { hashToken, newToken, newUniqueId } from '../../lib/crypto.ts'
import { HttpError, parse } from '../../lib/errors.ts'
import { sendMail } from '../../lib/mailer.ts'
import { endSession, startSession } from '../../lib/session.ts'
import { emailSchema, nameSchema, passwordSchema } from '../../lib/validation.ts'
import { alreadyRegistered, verifyEmail } from './emails.ts'
import { sessionOf } from './users.ts'

const SignUp = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  acceptedTerms: z.boolean().refine((v) => v, 'Agree to the Terms and Agreements to continue.'),
})
const SignIn = z.object({ email: emailSchema, password: z.string('Enter your password.').min(1, 'Enter your password.').max(128), remember: z.boolean().default(false) })
const Resend = z.object({ email: emailSchema })

/** Without Brevo or a mail server the link is printed in the backend's terminal, so say so rather than "check your inbox". */
const delivery = () => (config.mailConfigured ? 'email' : ('console' as const))

const VERIFY_TTL = 24 * 60 * 60 * 1000
const RESEND_AFTER = 2 * 60 * 1000 // don't email a new link more often than this
const strict = (max: number) => ({ config: { rateLimit: { max, timeWindow: '1 minute' } } })

// Checked against when the email isn't registered, so a wrong email takes as long as a wrong password
// (otherwise response times would reveal which emails have accounts).
const dummyHash = hash('memoir-not-a-real-password')

/** Emails a fresh confirmation link (replacing older ones), unless one went out in the last two minutes. */
async function sendVerification(user: UserRow, force = false) {
  if (!force) {
    const recent = await db.query.emailTokens.findFirst({
      where: and(eq(emailTokens.userId, user.id), eq(emailTokens.purpose, 'verify'), gt(emailTokens.createdAt, new Date(Date.now() - RESEND_AFTER))),
    })
    if (recent) return
  }
  const token = newToken()
  await db.transaction(async (tx) => {
    await tx.delete(emailTokens).where(and(eq(emailTokens.userId, user.id), eq(emailTokens.purpose, 'verify')))
    await tx.insert(emailTokens).values({ id: hashToken(token), userId: user.id, purpose: 'verify', expiresAt: new Date(Date.now() + VERIFY_TTL) })
  })
  // if the mail server is down, the account still exists and "resend" can try again later
  try {
    await sendMail(verifyEmail(user.email, user.name, `${config.apiOrigin}/api/auth/verify?token=${token}`))
  } catch (e) {
    console.error(`Couldn’t send the confirmation email to ${user.email}:`, (e as Error).message)
  }
}

async function insertUser(values: Omit<typeof users.$inferInsert, 'uniqueId'>) {
  for (let attempt = 0; ; attempt++) {
    try {
      const [user] = await db.insert(users).values({ ...values, uniqueId: newUniqueId() }).returning()
      return user
    } catch (e) {
      // ~10^12 possible IDs, so a clash is very unlikely; try another
      if (attempt < 3 && isUniqueViolation(e, 'users_unique_id_key')) continue
      throw e
    }
  }
}

export default async function authRoutes(app: FastifyInstance) {
  /**
   * Always answers "check your inbox", whether or not the email is already registered, so the form
   * can't be used to find out who has an account. The email itself tells the owner what happened.
   */
  app.post('/signup', strict(5), async (req, reply) => {
    const input = parse(SignUp, req.body)
    const passwordHash = await hash(input.password)
    const existing = await db.query.users.findFirst({ where: eq(users.email, input.email) })
    if (existing?.emailVerifiedAt) {
      await sendMail(alreadyRegistered(existing.email, existing.name)).catch((e: Error) => console.error('Couldn’t send the "already registered" email:', e.message))
    } else if (existing) {
      // never confirmed: the newest sign-up's details win, and older links stop working,
      // so only whoever can read the inbox decides which password the account ends up with
      const [updated] = await db
        .update(users)
        .set({ name: input.name, passwordHash, termsAcceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, existing.id))
        .returning()
      await sendVerification(updated, true)
    } else {
      try {
        const user = await insertUser({ email: input.email, name: input.name, passwordHash, termsAcceptedAt: new Date() })
        await sendVerification(user, true)
      } catch (e) {
        if (!isUniqueViolation(e, 'users_email_key')) throw e // signed up twice at once: the first one stands
      }
    }
    return reply.code(202).send({ status: 'verify-email', email: input.email, delivery: delivery() })
  })

  /** The link in the confirmation email. Lands back on the sign-in screen with the result. */
  app.get('/verify', async (req, reply) => {
    const { token } = req.query as { token?: string }
    const back = (result: string) => reply.redirect(`${config.appOrigin}/?verified=${result}`)
    if (!token) return back('invalid')
    const row = await db.query.emailTokens.findFirst({ where: and(eq(emailTokens.id, hashToken(token)), eq(emailTokens.purpose, 'verify')) })
    if (!row) return back('invalid')
    if (row.expiresAt < new Date()) {
      await db.delete(emailTokens).where(eq(emailTokens.id, row.id))
      return back('expired')
    }
    await db.transaction(async (tx) => {
      await tx.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, row.userId))
      await tx.delete(emailTokens).where(and(eq(emailTokens.userId, row.userId), eq(emailTokens.purpose, 'verify')))
    })
    return back('1')
  })

  app.post('/resend-verification', strict(3), async (req, reply) => {
    const { email } = parse(Resend, req.body)
    const user = await db.query.users.findFirst({ where: eq(users.email, email) })
    if (user && !user.emailVerifiedAt) await sendVerification(user)
    return reply.code(202).send({ status: 'verify-email', email, delivery: delivery() })
  })

  app.post('/signin', strict(10), async (req, reply) => {
    const input = parse(SignIn, req.body)
    const user = await db.query.users.findFirst({ where: eq(users.email, input.email) })
    const ok = user ? await verify(user.passwordHash, input.password) : (await verify(await dummyHash, input.password), false)
    if (!user || !ok) throw new HttpError(401, 'wrong-credentials', 'Wrong email or password.')
    if (!user.emailVerifiedAt) {
      await sendVerification(user)
      const where = delivery() === 'console' ? 'The link is printed in the backend’s terminal (no mail server is set up).' : `We sent a link to ${user.email}.`
      throw new HttpError(403, 'email-unverified', `Confirm your email first. ${where}`, 'email')
    }
    let current = user
    if (user.deactivatedAt) {
      // signing in again brings a deactivated account back
      ;[current] = await db.update(users).set({ deactivatedAt: null, updatedAt: new Date() }).where(eq(users.id, user.id)).returning()
    }
    const token = await startSession(reply, current.id, input.remember)
    // the cookie is enough when the app and the API share an address; the token is for when they don't
    return { ...sessionOf(current), token }
  })

  app.post('/signout', async (req, reply) => {
    await endSession(req, reply)
    return reply.code(204).send()
  })

  /** The current session, or null. Not a 401, so a signed-out page load doesn't log an error. */
  app.get('/session', async (req) => ({ session: req.auth ? sessionOf(req.auth.user) : null }))
}
