import nodemailer from 'nodemailer'
import { config } from '../config.ts'

export type Mail = { to: string; subject: string; text: string; html: string }

const transport = config.SMTP_URL ? nodemailer.createTransport(config.SMTP_URL) : null

/** Emails sent while testing, newest last (only kept when NODE_ENV=test). */
export const testOutbox: Mail[] = []

/** Whether email will get out: 'console' (no SMTP_URL), 'ok', or the SMTP server's complaint. */
export async function checkMail(): Promise<string> {
  if (!transport) return 'console'
  try {
    await transport.verify()
    return 'ok'
  } catch (e) {
    return (e as Error).message
  }
}

/** Sends through SMTP when SMTP_URL is set; otherwise prints the email (and its links) in the terminal. */
export async function sendMail(mail: Mail) {
  if (config.NODE_ENV === 'test') {
    testOutbox.push(mail)
    return
  }
  if (transport) {
    await transport.sendMail({ from: config.MAIL_FROM, ...mail })
    return
  }
  const rule = '─'.repeat(64)
  console.log(`\n${rule}\n✉  To: ${mail.to}\n   ${mail.subject}\n\n${mail.text.replace(/^/gm, '   ')}\n${rule}\n`)
}
