import { config } from '../config.ts'
import { checkMail, sendMail } from '../lib/mailer.ts'

// `npm run mail -- you@example.com`: says how email is set up, then sends one real email there.
// Use it to tell "Brevo won't take this" apart from "Brevo took it and the inbox never showed it".

const to = process.argv[2]?.trim()
if (!to?.includes('@')) {
  console.error('Which address? Usage: npm run mail -- you@example.com')
  process.exit(1)
}

const via = { brevo: `Brevo’s API, as ${config.mailFrom.name} <${config.mailFrom.email}>`, smtp: 'SMTP', console: 'nothing — emails are printed in the terminal' }[config.mailVia]
console.log(`Sending through: ${via}`)

const check = await checkMail()
if (!check.ok) {
  console.error(`\n✗ ${check.detail}`)
  process.exit(1)
}
if (config.mailVia !== 'console') console.log('✓ Settings accepted.')

try {
  await sendMail({
    to,
    subject: 'Memoir test email',
    text: `This is a test from the Memoir backend. If you're reading it, confirmation emails will arrive too.`,
    html: `<p>This is a test from the Memoir backend. If you’re reading it, confirmation emails will arrive too.</p>`,
  })
} catch (e) {
  console.error(`\n✗ It was refused: ${(e as Error).message}`)
  process.exit(1)
}

console.log(
  config.mailVia === 'console'
    ? '\nThat’s the email, above. Set BREVO_API_KEY in .env to send it for real.'
    : `\n✓ Sent to ${to}. It usually lands within a minute — check the spam folder too, and Brevo → Transactional → Logs to see what happened to it.`,
)
