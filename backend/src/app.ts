import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import { config } from './config.ts'
import { pool } from './db/client.ts'
import accountRoutes from './features/account/routes.ts'
import authRoutes from './features/auth/routes.ts'
import spotifyRoutes from './features/spotify/routes.ts'
import { errorHandler, HttpError } from './lib/errors.ts'
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
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute' })
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 } })
  // profile pictures; names are random and never reused, so they can be cached for good
  await mkdir(path.resolve(config.UPLOAD_DIR, 'avatars'), { recursive: true })
  await app.register(fastifyStatic, { root: path.resolve(config.UPLOAD_DIR), prefix: '/api/files/', decorateReply: false, maxAge: '365d', immutable: true })

  // Changes may only come from the web app itself. With SameSite cookies and JSON bodies this is
  // belt and braces against cross-site request forgery.
  app.addHook('onRequest', async (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return
    const origin = req.headers.origin
    if (origin && origin !== config.appOrigin) throw new HttpError(403, 'bad-origin', 'Requests must come from the Memoir app.')
  })
  registerSessions(app)

  app.get('/api/health', async () => {
    await pool.query('select 1')
    return { ok: true }
  })
  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(accountRoutes, { prefix: '/api/account' })
  await app.register(spotifyRoutes, { prefix: '/api/spotify' })

  return app
}
