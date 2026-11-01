import { z } from 'zod'

// Settings come from the environment (.env in development, the host's dashboard in production).
// The server refuses to start with a bad one.

const blankIsUnset = (v: unknown) => (v === '' ? undefined : v)
const optional = z.preprocess(blankIsUnset, z.string().optional())

/**
 * Hosting dashboards are pasted into, so values arrive with the odd stray quote or space, or with the
 * name of the setting still in front ("CLOUDINARY_URL=cloudinary://…"). Those are tidied away; anything
 * still wrong is said plainly at start-up, rather than crashing somewhere inside a library.
 */
const pasted = (name: string) =>
  z.preprocess((v) => {
    if (typeof v !== 'string') return v
    const cleaned = v
      .trim()
      .replace(new RegExp(`^${name}\\s*=`, 'i'), '')
      .trim()
      .replace(/^(['"])([\s\S]*)\1$/, '$2')
      .trim()
    return cleaned === '' ? undefined : cleaned
  }, z.string())

/** A value copied from documentation with <your_api_key> still in it. */
const hasPlaceholders = (v: string) => /[<>]/.test(v)

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  /**
  * On a laptop, listen only to this machine. On a host (Render, Fly, a VPS) the request arrives from
  * outside the container, so it has to be 0.0.0.0 or nothing can reach it — Render reports that as
  * "no open ports detected".
  */
  HOST: z.string().default(process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  /** Hosts hand the port to use in PORT; 4000 is just the local default. */
  PORT: z.coerce.number().int().default(4000),
  /** Where the web app is. Links in emails and the return from Spotify go here. */
  APP_URL: z.url().default('http://127.0.0.1:5173'),
  /** This server's own public address. Left out in development, where the app proxies /api. */
  API_URL: z.preprocess(blankIsUnset, z.url().optional()),
  /** Other addresses allowed to call this API, comma separated (Vercel previews, the Electron app). */
  EXTRA_ORIGINS: optional,
  DATABASE_URL: pasted('DATABASE_URL')
    .refine((v) => !hasPlaceholders(v), 'DATABASE_URL still has <placeholders> in it — copy the real connection string from your database host.')
    .refine((v) => /^postgres(ql)?:\/\//.test(v), 'DATABASE_URL must start with postgres:// — paste only the connection string, not the "DATABASE_URL=" part.'),
  TOKEN_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'TOKEN_KEY must be 32 random bytes, base64 (see .env.example)'),
  SPOTIFY_CLIENT_ID: optional,
  SPOTIFY_CLIENT_SECRET: optional,
  SMTP_URL: optional,
  // Calls: STUN lets two devices find a path to each other; TURN relays when they can't
  // (see docker-compose.yml for a local coturn).
  STUN_URLS: z.string().default('stun:stun.l.google.com:19302'),
  /** One or more TURN addresses, comma separated. Hosted providers give several (UDP, TCP, TLS). */
  TURN_URL: optional,
  /** Either a fixed username and password (most hosted TURN), or a shared secret (coturn). */
  TURN_USERNAME: optional,
  TURN_PASSWORD: optional,
  TURN_SECRET: optional,
  /** How long a set of TURN credentials worked out from TURN_SECRET stays valid (seconds). */
  TURN_TTL: z.coerce.number().int().default(3600),
  MAIL_FROM: z.string().default('Memoir <no-reply@memoir.local>'),
  /** Photos and videos: a local folder in development, Cloudinary once CLOUDINARY_URL is set. */
  UPLOAD_DIR: z.string().default('uploads'),
  CLOUDINARY_URL: pasted('CLOUDINARY_URL')
    .refine(
      (v) => !hasPlaceholders(v),
      'CLOUDINARY_URL still has the <your_api_key> and <your_api_secret> placeholders in it. Open the Cloudinary dashboard \u2192 Settings \u2192 API Keys and copy the real values in.',
    )
    .refine(
      (v) => v.startsWith('cloudinary://'),
      'CLOUDINARY_URL must start with cloudinary:// \u2014 paste only the value, not the "CLOUDINARY_URL=" part in front of it.',
    )
    .optional(),
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
  turnUrls: env.TURN_URL?.split(',').map((u) => u.trim()).filter(Boolean) ?? [],
  turnConfigured: !!(env.TURN_URL && (env.TURN_SECRET || (env.TURN_USERNAME && env.TURN_PASSWORD))),
  cloudinary: !!env.CLOUDINARY_URL,
  tokenKey: Buffer.from(env.TOKEN_KEY, 'base64'),
}
