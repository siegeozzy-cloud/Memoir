import { buildApp } from './app.ts'
import { config } from './config.ts'
import { pool, runMigrations } from './db/client.ts'
import { checkMail } from './lib/mailer.ts'

try {
  await runMigrations()
} catch (e) {
  const err = e as Error & { code?: string; cause?: { code?: string } }
  const offline = [err.code, err.cause?.code].some((c) => c === 'ECONNREFUSED' || c === 'ENOTFOUND')
  if (offline) console.error(`Can't reach the database at ${config.DATABASE_URL.replace(/:[^:@/]*@/, ':•••@')}.\nIs it running? Start it with: npm run db:up`)
  else console.error('Couldn’t update the database:', err.message)
  process.exit(1)
}

const app = await buildApp()
try {
  await app.listen({ host: config.HOST, port: config.PORT })
} catch (e) {
  if ((e as { code?: string }).code !== 'EADDRINUSE') throw e
  console.error(`Port ${config.PORT} is already in use: another copy of the backend is probably running. Stop it, or find it with: lsof -i :${config.PORT}`)
  await pool.end()
  process.exit(1)
}
if (!config.spotifyConfigured) app.log.info('Spotify isn’t set up (SPOTIFY_CLIENT_ID / SECRET in .env): the app offers its demo player instead.')
const mail = await checkMail()
if (mail === 'console') app.log.info('No SMTP_URL: emails, including confirmation links, are printed in this terminal.')
else if (mail === 'ok') app.log.info('Email: connected to the SMTP server, confirmation links go to real inboxes.')
else app.log.error(`Email: can’t sign in to the SMTP server (${mail}). Check SMTP_URL in .env. Until then, sign-up emails fail.`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    await app.close()
    await pool.end()
    process.exit(0)
  })
}
