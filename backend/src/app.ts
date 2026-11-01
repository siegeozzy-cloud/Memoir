import { mkdir } from 'node:fs/promises'
import path from 'node:path'
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
import spotifyRoutes from './features/spotify/routes.ts'
import { errorHandler, HttpError } from './lib/errors.ts'
import { onDisconnect, registerRealtime } from './lib/realtime.ts'
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

  app.get('/api/health', async () => {
    await pool.query('select 1')
    return { ok: true }
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
