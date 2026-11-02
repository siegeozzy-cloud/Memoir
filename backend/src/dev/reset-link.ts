import { and, eq } from 'drizzle-orm'
import { config } from '../config.ts'
import { db, pool } from '../db/client.ts'
import { emailTokens, users } from '../db/schema.ts'
import { hashToken, newToken } from '../lib/crypto.ts'

// `npm run reset-link -- you@example.com`: prints a password reset link, for local development.
//
// Without a mail server the link is printed by the running server, which is easy to lose among its
// request logs — and asking again within two minutes sends nothing, so it looks as if it failed.
// This makes one on demand, the same way `npm run verify` confirms an address without the email.

if (!config.dev) {
  console.error('This only works in development. In production people use the link emailed to them.')
  process.exit(1)
}

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error('Which account? Usage: npm run reset-link -- you@example.com')
  process.exit(1)
}

const user = await db.query.users.findFirst({ where: eq(users.email, email) })
if (!user) {
  console.error(`No account for ${email}. Sign up first.`)
  await pool.end()
  process.exit(1)
}

const token = newToken()
await db.transaction(async (tx) => {
  await tx.delete(emailTokens).where(and(eq(emailTokens.userId, user.id), eq(emailTokens.purpose, 'reset')))
  await tx.insert(emailTokens).values({ id: hashToken(token), userId: user.id, purpose: 'reset', expiresAt: new Date(Date.now() + 60 * 60 * 1000) })
})

console.log(`\nA new password for ${user.email} — open this within the hour:\n\n  ${config.apiOrigin}/api/auth/reset?token=${token}\n`)
await pool.end()
