import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { constants as zlibConstants } from 'node:zlib'
import compress from '@fastify/compress'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import { config } from './config.ts'
import { pool } from './db/client.ts'
import accountRoutes from './features/account/routes.ts'
import authRoutes from './features/auth/routes.ts'
import callRoutes, { dropCallsOf, registerCallSignalling } from './features/calls/routes.ts'
import chatRoutes from './features/chat/routes.ts'
import friendRoutes from './features/friends/routes.ts'
import memoryRoutes, { purgeOldMemories } from './features/memories/routes.ts'
import { startActivityPolling } from './features/spotify/activity.ts'
import { forgetSpotifyLink } from './features/spotify/client.ts'
import spotifyRoutes from './features/spotify/routes.ts'
import { errorHandler, HttpError } from './lib/errors.ts'
import { onDisconnect, registerRealtime } from './lib/realtime.ts'
import { registerSecurityHeaders } from './lib/security.ts'
import { registerSessions } from './lib/session.ts'

export async function buildApp() {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : config.dev
          ? { transport: { target: 'pino-pretty', options: { ignore: 'pid,hostname,reqId', translateTime: 'HH:MM:ss' } } }
          : true,
    // requests arrive through the web app's dev proxy (or a reverse proxy in production) on this machine
    trustProxy: '127.0.0.1',
    bodyLimit: 64 * 1024,
  })

  app.setErrorHandler(errorHandler)
  // first, so every answer below — routes, static files, errors — carries them
  registerSecurityHeaders(app)
  /**
   * JSON compresses to a fraction of its size, and nothing in front of this server does it for us.
   * It is the cheapest way to stay inside a metered plan's bandwidth, and browsers ask for it by
   * themselves. Below the threshold the header costs more than it saves, and already-compressed
   * photos and videos from /api/files are skipped — the plugin goes by whether a type is
   * compressible at all.
   *
   * gzip is listed first on purpose: brotli squeezes maybe a tenth more out of a payload for several
   * times the processor time, which is the one thing a small shared instance has least of.
   */
  await app.register(compress, {
    global: true,
    threshold: 1024,
    encodings: ['gzip', 'deflate', 'br'],
    brotliOptions: { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 } },
  })
  await app.register(cookie)
  // The app and the API are on different addresses in production, so the browser asks permission first.
  await app.register(cors, {
    origin: (origin, done) => done(null, !origin || config.allowedOrigins.includes(origin)),
    credentials: true, // for the cookie, when app and API do share an address
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  })
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' })
  await app.register(multipart, { limits: { fileSize: 64 * 1024 * 1024, files: 20, fields: 10 } })
  // Pictures and videos. With Cloudinary they're served from there; otherwise from the local folder.
  // Names are random and never reused, so they can be cached for good.
  if (!config.cloudinary) {
    for (const folder of ['avatars', 'media']) await mkdir(path.resolve(config.UPLOAD_DIR, folder), { recursive: true })
    await app.register(fastifyStatic, {
      root: path.resolve(config.UPLOAD_DIR),
      prefix: '/api/files/',
      decorateReply: false,
      maxAge: '365d',
      immutable: true,
      // stored files are never run as code, whatever a browser might guess them to be
      setHeaders: (res) => res.header('X-Content-Type-Options', 'nosniff'),
    })
  }

  // Changes may only come from the web app itself. With SameSite cookies and JSON bodies this is
  // belt and braces against cross-site request forgery.
  app.addHook('onRequest', async (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return
    const origin = req.headers.origin
    if (origin && !config.allowedOrigins.includes(origin)) throw new HttpError(403, 'bad-origin', 'Requests must come from the Memoir app.')
  })
  registerSessions(app)
  await registerRealtime(app)
  registerCallSignalling()
  onDisconnect(dropCallsOf) // closing the last tab hangs up
  onDisconnect(forgetSpotifyLink) // and stops us holding their Spotify link in memory

  /**
   * "Is the server up?" — and nothing else. This is what the host's health check and the keep-alive
   * cron job call, every few minutes, forever, so it deliberately touches no database: a query here
   * would reset the database's idle timer each time and keep a serverless Postgres awake around the
   * clock, which is metered. Use /api/health when you want to know the database is reachable too.
   */
  app.get('/api/ping', async () => ({ ok: true }))

  app.get('/api/health', async () => {
    await pool.query('select 1')
    return { ok: true, db: true }
  })
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(accountRoutes, { prefix: '/api/account' })
  await app.register(friendRoutes, { prefix: '/api/friends' })
  await app.register(chatRoutes, { prefix: '/api/chat' })
  await app.register(memoryRoutes, { prefix: '/api/memories' })
  await app.register(callRoutes, { prefix: '/api/calls' })
  await app.register(spotifyRoutes, { prefix: '/api/spotify' })

  if (config.NODE_ENV !== 'test') {
    startActivityPolling(app)
    const sweep = () => void purgeOldMemories().then((n) => n && app.log.info(`Emptied ${n} post(s) from Recently Deleted.`))
    sweep()
    setInterval(sweep, 24 * 60 * 60 * 1000).unref()
  }

  return app
}
