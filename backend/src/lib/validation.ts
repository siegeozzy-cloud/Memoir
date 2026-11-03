import { z } from 'zod'

// Field rules shared by sign-in, sign-up, the password forms and the profile.
//
// Injection is handled by the database layer — every query drizzle builds is parameterised, so a value
// is never read as SQL whatever it contains. These rules are the second line: a box that only ever holds
// the characters its field genuinely needs can't be used to carry a payload on towards a log line, an
// email header, a shell or a page. Passwords are the exception on purpose, below.

/**
 * The characters an address may use: letters, digits and the four separators real addresses need
 * (`.`, `_`, `+`, `-`). Quotes, `#`, `$`, `%`, `&`, `*`, `!`, `/`, `=`, `?`, backslashes, parentheses,
 * angle brackets and the rest of what RFC 5322 technically permits are refused — no mail provider
 * issues addresses with them, so in a sign-up box they are only ever a mistake or an attempt.
 * `+` stays because plus-addressing (you+memoir@gmail.com) is in everyday use.
 */
const EMAIL_SHAPE = /^[a-z0-9]([a-z0-9._+-]*[a-z0-9])?@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/

const BAD_EMAIL_CHARS = 'Emails can use letters, digits and . _ + - only — leave out other symbols.'

/**
 * Invisible characters: control codes, and the two line separators. A password is allowed every
 * printable character there is, but not these — they can't be typed back reliably, and they are what
 * would let a value split a log line or a mail header further along.
 */
const INVISIBLE = /[\p{Cc}\p{Zl}\p{Zp}]/u
const NO_INVISIBLE = 'Leave out tabs, line breaks and other invisible characters.'

export const emailSchema = z
  .string('Enter your email.')
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email.')
  .max(254, 'That email is too long.')
  // first, so a refused character is named as one rather than reported as a malformed address
  .refine((v) => !/[^a-z0-9@._+-]/.test(v), BAD_EMAIL_CHARS)
  .pipe(z.email('Enter a valid email address, like you@example.com.'))
  .refine((v) => EMAIL_SHAPE.test(v) && !v.includes('..'), 'Enter a valid email address, like you@example.com.')

/**
 * New passwords. The *character set* is deliberately wide — every printable character, in any script,
 * is allowed, because length and variety are what make a password hard to guess, and a password is
 * hashed with Argon2id the moment it arrives and never put into a query, a page or an email. Banning
 * punctuation here would only make accounts easier to break into. What is refused is the invisible
 * characters above, which no one means to type.
 */
export const passwordSchema = z
  .string('Enter a password.')
  .min(8, 'Use at least 8 characters for your password.')
  .max(128, 'Use 128 characters or fewer for your password.')
  .refine((v) => !INVISIBLE.test(v), NO_INVISIBLE)

/**
 * The password box on the sign-in form: the same invisible-character rule, but no length rule — an
 * account made before the limits changed must still be able to get in, and the answer to a wrong
 * password is "wrong email or password" either way.
 */
export const existingPasswordSchema = z
  .string('Enter your password.')
  .min(1, 'Enter your password.')
  .max(128, 'Use 128 characters or fewer for your password.')
  .refine((v) => !INVISIBLE.test(v), NO_INVISIBLE)

export const nameSchema = z
  .string('Enter your name.')
  .transform((s) => s.trim().replace(/\s+/g, ' '))
  .pipe(
    z
      .string()
      .min(1, 'Enter your name.')
      .max(50, 'Use 50 characters or fewer for your name.')
      .regex(/^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u, 'Names can use letters, spaces, apostrophes ( \' ), hyphens ( - ) and periods.'),
  )

/**
 * The single-use token out of a confirmation or reset link: 43 characters of base64url, as
 * lib/crypto.ts makes them. Anything else never reaches the database lookup.
 */
export const linkTokenSchema = z
  .string('That link doesn’t work anymore.')
  .trim()
  .min(1, 'That link doesn’t work anymore.')
  .max(128, 'That link doesn’t work anymore.')
  .regex(/^[A-Za-z0-9_-]+$/, 'That link doesn’t work anymore.')

export const statusSchema = z.enum(['online', 'idle', 'dnd', 'offline'], 'Pick Active, Sleep, Do not disturb or Inactive.')
