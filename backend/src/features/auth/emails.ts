import { config } from '../../config.ts'
import type { Mail } from '../../lib/mailer.ts'

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function mail(to: string, subject: string, lines: string[], action?: { label: string; url: string }): Mail {
  const text = [...lines, ...(action ? ['', `${action.label}: ${action.url}`] : [])].join('\n')
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">${lines.map((l) => `<p>${escape(l)}</p>`).join('')}${
    action ? `<p><a href="${escape(action.url)}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:#111;color:#fff;text-decoration:none">${escape(action.label)}</a></p>` : ''
  }</div>`
  return { to, subject, text, html }
}

export const verifyEmail = (to: string, name: string, url: string) =>
  mail(
    to,
    'Confirm your email for Memoir',
    [`Hi ${name},`, 'Confirm this is your email to finish creating your Memoir account. The link works for 24 hours.', 'If you didn’t sign up, you can ignore this email.'],
    { label: 'Confirm my email', url },
  )

/** Someone tried to sign up with an address that already has an account. */
export const alreadyRegistered = (to: string, name: string) =>
  mail(
    to,
    'You already have a Memoir account',
    [`Hi ${name},`, 'Someone (hopefully you) tried to create a Memoir account with this email, but you already have one.', 'If that wasn’t you, you can ignore this email.'],
    { label: 'Sign in', url: config.appOrigin },
  )
