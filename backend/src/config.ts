import { z } from 'zod'

// Settings come from the environment (.env in development). The server refuses to start with a bad one.

const blankIsUnset = (v: unknown) => (v === '' ? undefined : v)
const optional = z.preprocess(blankIsUnset, z.string().optional())

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().default(4000),
  APP_URL: z.url().default('http://127.0.0.1:5173'),
  DATABASE_URL: z.string().min(1),
  TOKEN_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'TOKEN_KEY must be 32 random bytes, base64 (see .env.example)'),
  SPOTIFY_CLIENT_ID: optional,
  SPOTIFY_CLIENT_SECRET: optional,
  SMTP_URL: optional,
  MAIL_FROM: z.string().default('Memoir <no-reply@memoir.local>'),
  UPLOAD_DIR: z.string().default('uploads'),
})

const parsed = Env.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid settings in .env:\n' + parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n'))
  process.exit(1)
}

const env = parsed.data
const appOrigin = new URL(env.APP_URL).origin

export const config = {
  ...env,
  dev: env.NODE_ENV !== 'production',
  appOrigin,
  /** Spotify sends people back here; it goes through the web app's /api proxy so the session cookie comes along. */
  spotifyRedirectUri: `${appOrigin}/api/spotify/callback`,
  spotifyConfigured: !!(env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET),
  tokenKey: Buffer.from(env.TOKEN_KEY, 'base64'),
}
