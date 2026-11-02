import nodemailer from 'nodemailer'
import { config } from '../config.ts'

export type Mail = { to: string; subject: string; text: string; html: string }

/** A mail server that hangs shouldn't hold a sign-up open for minutes; nodemailer reads these from the URL. */
function withTimeouts(url: string) {
  const u = new URL(url)
  for (const [key, value] of Object.entries({ connectionTimeout: '10000', greetingTimeout: '10000', socketTimeout: '20000' })) {
    if (!u.searchParams.has(key)) u.searchParams.set(key, value)
  }
  return u.toString()
}

const transport = config.mailVia === 'smtp' ? nodemailer.createTransport(withTimeouts(config.SMTP_URL!)) : null

/**
 * Brevo over plain HTTPS. Preferred to its SMTP relay because home networks, student networks and some
 * hosts block the mail ports (587, 465) outright, which looks like a hanging or timing-out sign-up.
 */
async function brevo(path: string, init?: RequestInit) {
  let res: Response
  try {
    res = await fetch(`https://api.brevo.com/v3${path}`, {
      ...init,
      headers: { 'api-key': config.BREVO_API_KEY!, accept: 'application/json', 'content-type': 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
  } catch (e) {
    throw new Error(`can’t reach api.brevo.com (${(e as Error).message})`)
  }
  const body = (await res.json().catch(() => null)) as { message?: string; code?: string } | null
  if (res.ok) return body
  // Brevo's own wording is short ("Key not found"), so say what it means for this setting.
  const said = body?.message ?? `${res.status} ${res.statusText}`
  if (res.status === 401) throw new Error(`Brevo rejected the API key (${said}). Copy it again from Brevo → SMTP & API → API keys into BREVO_API_KEY.`)
  throw new Error(`Brevo refused the request: ${said}`)
}

/** Emails sent while testing, newest last (only kept when NODE_ENV=test). */
export const testOutbox: Mail[] = []

export type MailCheck = { via: 'console' | 'brevo' | 'smtp'; ok: boolean; detail?: string }

/** Whether email will actually get out, and what to fix if not. Run once at start-up. */
export async function checkMail(): Promise<MailCheck> {
  if (config.mailVia === 'console') return { via: 'console', ok: true }
  if (config.mailVia === 'smtp') {
    try {
      await transport!.verify()
      return { via: 'smtp', ok: true }
    } catch (e) {
      return { via: 'smtp', ok: false, detail: (e as Error).message }
    }
  }
  try {
    // Does the key work, and will Brevo send from MAIL_FROM? An unlisted sender is the usual reason
    // sign-up emails are accepted by the API and then never arrive.
    const { senders } = (await brevo('/senders')) as { senders?: { email: string; active: boolean }[] }
    const sender = senders?.find((s) => s.email.toLowerCase() === config.mailFrom.email.toLowerCase())
    if (!sender) {
      const known = senders?.map((s) => s.email).join(', ') || 'none yet'
      return { via: 'brevo', ok: false, detail: `${config.mailFrom.email} isn’t one of your Brevo senders (${known}). Add and verify it under Senders, domains & dedicated IPs, or set MAIL_FROM to one that is.` }
    }
    if (!sender.active) return { via: 'brevo', ok: false, detail: `${sender.email} is listed in Brevo but not activated — open the confirmation email Brevo sent to that address.` }
    return { via: 'brevo', ok: true }
  } catch (e) {
    return { via: 'brevo', ok: false, detail: (e as Error).message }
  }
}

/** Sends through Brevo or SMTP when either is set up; otherwise prints the email (and its links) in the terminal. */
export async function sendMail(mail: Mail) {
  if (config.NODE_ENV === 'test') {
    testOutbox.push(mail)
    return
  }
  if (config.mailVia === 'brevo') {
    await brevo('/smtp/email', {
      method: 'POST',
      body: JSON.stringify({
        sender: config.mailFrom,
        to: [{ email: mail.to }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
      }),
    })
    return
  }
  if (transport) {
    await transport.sendMail({ from: config.MAIL_FROM, ...mail })
    return
  }
  const rule = '─'.repeat(64)
  console.log(`\n${rule}\n✉  To: ${mail.to}\n   ${mail.subject}\n\n${mail.text.replace(/^/gm, '   ')}\n${rule}\n`)
}
