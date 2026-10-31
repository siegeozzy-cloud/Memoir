import { z } from 'zod'

// Field rules shared by sign-up and the profile. Injection is handled by the database layer
// (every query is parameterised), so these are about sensible values, not about banning characters:
// passwords may contain anything, and names allow letters from any language plus ' - . and spaces.

export const emailSchema = z
  .string('Enter your email.')
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email.')
  .max(254, 'That email is too long.')
  .pipe(z.email('Enter a valid email address, like you@example.com.'))

export const passwordSchema = z
  .string('Enter a password.')
  .min(8, 'Use at least 8 characters for your password.')
  .max(128, 'Use 128 characters or fewer for your password.')

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

export const statusSchema = z.enum(['online', 'idle', 'dnd', 'offline'], 'Pick Active, Sleep, Do not disturb or Inactive.')
