import { z } from 'zod'

// Settings come from the environment (.env in development, the host's dashboard in production).
// The server refuses to start with a bad one.

const blankIsUnset = (v: unknown) => (v === '' ? undefined : v)
const optional = z.preprocess(blankIsUnset, z.string().optional())

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().default(4000),
  /** Where the web app is. Links in emails and the return from Spotify go here. */
  APP_URL: z.url().default('http://127.0.0.1:5173'),
  /** This server's own public address. Left out in development, where the app proxies /api. */
  API_URL: z.preprocess(blankIsUnset, z.url().optional()),
  /** Other addresses allowed to call this API, comma separated (Vercel previews, the Electron app). */
  EXTRA_ORIGINS: optional,
  DATABASE_URL: z.string().min(1),
  TOKEN_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'TOKEN_KEY must be 32 random bytes, base64 (see .env.example)'),
  SPOTIFY_CLIENT_ID: optional,
  SPOTIFY_CLIENT_SECRET: optional,
  SMTP_URL: optional,
  // Calls: STUN lets two devices find a path to each other; TURN relays when they can't
  // (see docker-compose.yml for a local coturn).
  STUN_URLS: z.string().default('stun:stun.l.google.com:19302'),
  TURN_URL: optional,
  TURN_SECRET: optional,
  /** How long a set of TURN credentials stays valid (seconds). */
  TURN_TTL: z.coerce.number().int().default(3600),
  MAIL_FROM: z.string().default('Memoir <no-reply@memoir.local>'),
  /** Photos and videos: a local folder in development, Cloudinary once CLOUDINARY_URL is set. */
  UPLOAD_DIR: z.string().default('uploads'),
  CLOUDINARY_URL: optional,
  /** Everything Memoir stores there sits under this folder, so one account can hold several apps. */
  CLOUDINARY_FOLDER: z.string().default('memoir'),
})

const parsed = Env.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid settings:\n' + parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'))
  process.exit(1)
}

const env = parsed.data
const appOrigin = new URL(env.APP_URL).origin
const apiOrigin = env.API_URL ? new URL(env.API_URL).origin : appOrigin

export const config = {
  ...env,
  dev: env.NODE_ENV !== 'production',
  appOrigin,
  apiOrigin,
  /** Addresses whose requests are accepted. */
  allowedOrigins: [appOrigin, ...(env.EXTRA_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean) ?? [])],
  /**
   * Where Spotify sends people back. In development it goes through the app's /api proxy; in production
   * it must point at this server, because the app and the API are on different addresses.
   */
  spotifyRedirectUri: `${apiOrigin}/api/spotify/callback`,
  spotifyConfigured: !!(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET),
  stunUrls: env.STUN_URLS.split(',').map((u) => u.trim()).filter(Boolean),
  turnConfigured: !!(env.TURN_URL && env.TURN_SECRET),
  cloudinary: !!env.CLOUDINARY_URL,
  tokenKey: Buffer.from(env.TOKEN_KEY, 'base64'),
}
