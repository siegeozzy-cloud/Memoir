// What the sign-in, sign-up and password boxes will accept.
//
// The server decides — backend/src/lib/validation.ts holds the same rules, and nothing here is
// trusted there. These are so the person finds out while they're typing instead of after a round
// trip, and so a character that has no business in a field never leaves the browser at all.
//
// Each field is an allowlist: the characters it genuinely needs, and nothing else. An email has no
// use for quotes, #, $, %, & or *; a name has no use for digits or brackets. Narrow, predictable
// values are what keep a form from being a way to carry something somewhere it shouldn't go.
//
// Passwords are the deliberate exception: every printable character is allowed, in any script,
// because length and variety are what make one hard to guess. Only invisible characters are taken
// out. A password is hashed the moment it reaches the server and is never put into a query or a page.

/** The result of tidying a box: what it should now hold, and whether something was refused. */
export type Cleaned = {
  value: string
  /** True when a character was taken out — the forms turn this into a message. */
  blocked: boolean
}

const MAX = { email: 254, name: 50, password: 128 }

/** Control codes and line separators: never meant, never typeable back. */
const INVISIBLE = /[\p{Cc}\p{Zl}\p{Zp}]/gu
/** Letters, digits and the four separators real addresses use. */
const NOT_IN_EMAIL = /[^a-zA-Z0-9@._+-]/g
/** Letters and marks from any script, plus the three joiners names use. */
const NOT_IN_NAME = /[^\p{L}\p{M}' .-]/gu

const cleaned = (raw: string, stripped: string, max: number): Cleaned => ({
  value: stripped.slice(0, max),
  // only count characters that were refused, not ones simply cut off at the limit
  blocked: stripped !== raw,
})

/** An address holds no spaces at all, so whitespace is dropped quietly rather than counted as refused. */
export function cleanEmail(raw: string): Cleaned {
  const spaceless = raw.replace(/\s+/g, '')
  return cleaned(spaceless, spaceless.replace(NOT_IN_EMAIL, ''), MAX.email)
}

/** Runs of spaces collapse as you type; a leading space is kept until the field is checked. */
export function cleanName(raw: string): Cleaned {
  return cleaned(raw, raw.replace(NOT_IN_NAME, '').replace(/ {2,}/g, ' '), MAX.name)
}

export function cleanPassword(raw: string): Cleaned {
  return cleaned(raw, raw.replace(INVISIBLE, ''), MAX.password)
}

export const BLOCKED = {
  email: 'Emails can use letters, digits and . _ + - only — leave out other symbols.',
  name: 'Names can use letters, spaces, apostrophes ( \' ), hyphens ( - ) and periods.',
  password: 'Leave out tabs, line breaks and other invisible characters.',
}

/** Mirrors the server's EMAIL_SHAPE. Checked against the lowercased address. */
const EMAIL_SHAPE = /^[a-z0-9]([a-z0-9._+-]*[a-z0-9])?@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/

/** What's wrong with this address, or null. Checked when the form is sent, not while typing. */
export function emailProblem(value: string): string | null {
  const email = value.trim().toLowerCase()
  if (!email) return 'Enter your email.'
  if (email.length > MAX.email) return 'That email is too long.'
  if (NOT_IN_EMAIL.test(email)) {
    NOT_IN_EMAIL.lastIndex = 0 // the regex is global, so its position has to be put back
    return BLOCKED.email
  }
  if (!EMAIL_SHAPE.test(email) || email.includes('..')) return 'Enter a valid email address, like you@example.com.'
  return null
}

export function nameProblem(value: string): string | null {
  const name = value.trim().replace(/\s+/g, ' ')
  if (!name) return 'Enter your name.'
  if (name.length > MAX.name) return 'Use 50 characters or fewer for your name.'
  if (!/^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u.test(name)) return BLOCKED.name
  return null
}

/** A password being chosen. `existing: true` skips the length rules, for the sign-in box. */
export function passwordProblem(value: string, { existing = false } = {}): string | null {
  if (!value) return existing ? 'Enter your password.' : 'Enter a password.'
  if (INVISIBLE.test(value)) {
    INVISIBLE.lastIndex = 0
    return BLOCKED.password
  }
  if (value.length > MAX.password) return 'Use 128 characters or fewer for your password.'
  if (!existing && value.length < 8) return 'Use at least 8 characters for your password.'
  return null
}
