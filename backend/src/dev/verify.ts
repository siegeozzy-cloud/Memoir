import { eq } from 'drizzle-orm'
import { config } from '../config.ts'
import { db, pool } from '../db/client.ts'
import { users } from '../db/schema.ts'

// `npm run verify -- you@example.com`: confirms an account without the email link, for local development.

if (!config.dev) {
  console.error('This only works in development. In production people confirm their own email.')
  process.exit(1)
}

const email = process.argv[2]?.trim().toLowerCase()
if (!email) {
  console.error('Which account? Usage: npm run verify -- you@example.com')
  process.exit(1)
}

const [user] = await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.email, email)).returning()
console.log(user ? `${user.email} is confirmed. You can sign in now.` : `No account for ${email}. Sign up first.`)
await pool.end()
