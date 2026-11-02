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

/** The same, for a setting that may simply be left out — or left blank, as dashboards and .env files do. */
const pastedOptional = <T extends z.ZodType>(schema: T) => z.preprocess(blankIsUnset, schema.optional())

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
  /**
   * Brevo's transactional email API key, from Brevo → SMTP & API → API keys. Preferred to SMTP_URL:
   * it's an ordinary HTTPS call, so it still works on networks and hosts that block the mail ports.
   */
  BREVO_API_KEY: pastedOptional(
    pasted('BREVO_API_KEY')
      .refine((v) => !hasPlaceholders(v), 'BREVO_API_KEY still has <placeholders> in it — copy the real key from Brevo → SMTP & API → API keys.')
      .refine(
        (v) => v.startsWith('xkeysib-'),
        'BREVO_API_KEY must start with xkeysib- — that’s an API key (Brevo → SMTP & API → API keys). An SMTP key (xsmtpsib-) goes in SMTP_URL instead.',
      ),
  ),
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
  CLOUDINARY_URL: pastedOptional(
    pasted('CLOUDINARY_URL')
      .refine(
        (v) => !hasPlaceholders(v),
        'CLOUDINARY_URL still has the <your_api_key> and <your_api_secret> placeholders in it. Open the Cloudinary dashboard \u2192 Settings \u2192 API Keys and copy the real values in.',
      )
      .refine(
        (v) => v.startsWith('cloudinary://'),
        'CLOUDINARY_URL must start with cloudinary:// \u2014 paste only the value, not the "CLOUDINARY_URL=" part in front of it.',
      ),
  ),
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

/** `Memoir <no-reply@example.com>` as its two parts: Brevo's API wants the name and address apart. */
function mailAddress(from: string) {
  const m = /^\s*(?:"?([^"<]*)"?\s*)?<([^>]+)>\s*$/.exec(from)
  const [name, email] = m ? [m[1]?.trim(), m[2]] : [undefined, from]
  return { name: name || 'Memoir', email: email.trim() }
}
const mailFrom = mailAddress(env.MAIL_FROM)

/** How email leaves: Brevo's API, an SMTP server, or — with neither set up — the terminal. */
const mailVia = env.BREVO_API_KEY ? ('brevo' as const) : env.SMTP_URL ? ('smtp' as const) : ('console' as const)

// Brevo only sends from an address you've verified, so the made-up default would be refused on every send.
if (mailVia === 'brevo' && /\.(local|localhost|test|invalid|example|internal)$/i.test(mailFrom.email.split('@')[1] ?? '')) {
  console.error(
    `Invalid settings:\n  MAIL_FROM: ${env.MAIL_FROM} isn’t a real address, and Brevo only sends from one you’ve verified.\n    Set MAIL_FROM to your verified sender, e.g. MAIL_FROM="Memoir <you@gmail.com>".`,
  )
  process.exit(1)
}

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
  mailVia,
  mailFrom,
  /** Whether confirmation links reach a real inbox, or are only printed in the terminal. */
  mailConfigured: mailVia !== 'console',
  stunUrls: env.STUN_URLS.split(',').map((u) => u.trim()).filter(Boolean),
  turnUrls: env.TURN_URL?.split(',').map((u) => u.trim()).filter(Boolean) ?? [],
  turnConfigured: !!(env.TURN_URL && (env.TURN_SECRET || (env.TURN_USERNAME && env.TURN_PASSWORD))),
  cloudinary: !!env.CLOUDINARY_URL,
  tokenKey: Buffer.from(env.TOKEN_KEY, 'base64'),
}
