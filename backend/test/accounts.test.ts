import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import sharp from 'sharp'
import { buildApp } from '../src/app.ts'
import { pool, runMigrations } from '../src/db/client.ts'
import { decrypt, encrypt } from '../src/lib/crypto.ts'
import { testOutbox } from '../src/lib/mailer.ts'

// Runs against the development database (npm run db:up), with a fresh email each run.
// The whole account life: sign up → confirm email → sign in → profile → picture → deactivate → delete.

const app = await buildApp()
const ORIGIN = 'http://127.0.0.1:5173'
const email = `test+${Date.now()}@example.com`
const password = 'correct horse battery staple'
let cookie = ''

const json = (method: 'POST' | 'PATCH' | 'PUT' | 'GET' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, payload, headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) } })
const lastLink = () => /https?:\/\/\S+/.exec(testOutbox.at(-1)!.text)![0]

before(async () => {
  await runMigrations()
})
after(async () => {
  await app.close()
  await pool.end()
})

test('sign-up checks every field, with messages for people', async () => {
  const cases: [object, string][] = [
    [{ name: 'Maria', email: 'not-an-email', password, acceptedTerms: true }, 'email'],
    [{ name: 'Maria', email, password: 'short', acceptedTerms: true }, 'password'],
    [{ name: 'M4ria <script>', email, password, acceptedTerms: true }, 'name'],
    [{ name: 'Maria', email, password, acceptedTerms: false }, 'acceptedTerms'],
  ]
  for (const [body, field] of cases) {
    const r = await json('POST', '/api/auth/signup', body)
    assert.equal(r.statusCode, 400, field)
    assert.equal(r.json().error.field, field)
    assert.ok(r.json().error.message.length > 5)
  }
  // names from any language, with apostrophes and hyphens, are fine
  const ok = await json('POST', '/api/auth/signup', { name: "  José   O'Brien-Nguyễn ", email, password, acceptedTerms: true })
  assert.equal(ok.statusCode, 202)
  assert.deepEqual(ok.json(), { status: 'verify-email', email })
  assert.match(testOutbox.at(-1)!.subject, /Confirm your email/)
})

test('sign-in waits for the email to be confirmed', async () => {
  const r = await json('POST', '/api/auth/signin', { email, password })
  assert.equal(r.statusCode, 403)
  assert.equal(r.json().error.code, 'email-unverified')
})

test('the emailed link confirms the address once', async () => {
  const link = new URL(lastLink())
  const r = await app.inject({ method: 'GET', url: link.pathname + link.search })
  assert.equal(r.statusCode, 302)
  assert.equal(r.headers.location, `${ORIGIN}/?verified=1`)
  const again = await app.inject({ method: 'GET', url: link.pathname + link.search })
  assert.equal(again.headers.location, `${ORIGIN}/?verified=invalid`)
})

test('sign-up is limited to 5 tries a minute per address', async () => {
  const r = await json('POST', '/api/auth/signup', { name: 'Someone', email, password, acceptedTerms: true })
  assert.equal(r.statusCode, 429)
  assert.equal(r.json().error.code, 'rate-limited')
})

test('signing up again with a registered email reveals nothing on screen', async () => {
  const payload = { name: 'Someone', email, password: 'another password', acceptedTerms: true }
  const r = await app.inject({ method: 'POST', url: '/api/auth/signup', payload, headers: { origin: ORIGIN }, remoteAddress: '10.0.0.2' })
  assert.equal(r.statusCode, 202)
  assert.match(testOutbox.at(-1)!.subject, /already have/)
})

test('sign-in: a wrong password gets the same answer as an unknown email', async () => {
  const wrong = await json('POST', '/api/auth/signin', { email, password: 'nope nope nope' })
  const unknown = await json('POST', '/api/auth/signin', { email: 'nobody@example.com', password })
  assert.equal(wrong.statusCode, 401)
  assert.deepEqual(wrong.json(), unknown.json())
})

test('sign-in sets an httpOnly session cookie and returns the session', async () => {
  const r = await json('POST', '/api/auth/signin', { email: email.toUpperCase(), password, remember: true })
  assert.equal(r.statusCode, 200)
  const set = String(r.headers['set-cookie'])
  assert.match(set, /memoir_session=/)
  assert.match(set, /HttpOnly/)
  assert.match(set, /SameSite=Lax/)
  assert.match(set, /Max-Age=2592000/) // "keep me signed in": 30 days
  cookie = set.split(';')[0]
  assert.equal(r.json().user.name, "José O'Brien-Nguyễn")
  const s = await json('GET', '/api/auth/session')
  assert.equal(s.json().session.email, email)
})

test('profile: read and change name, status and notifications', async () => {
  const p = (await json('GET', '/api/account')).json()
  assert.match(p.uniqueId, /^MMR-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/)
  const r = await json('PATCH', '/api/account', { name: 'Maria S.', status: 'dnd', notifications: { tags: false } })
  assert.equal(r.statusCode, 200)
  assert.equal(r.json().user.name, 'Maria S.')
  assert.equal(r.json().user.status, 'dnd')
  assert.deepEqual(r.json().notifications, { messages: true, tags: false, friendRequests: true })
  const bad = await json('PATCH', '/api/account', { email: 'swap@example.com' })
  assert.equal(bad.statusCode, 400)
})

const multipart = (filename: string, type: string, data: Buffer) => {
  const boundary = '----memoir' + Date.now()
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="avatar"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`),
    data,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return { body, type: `multipart/form-data; boundary=${boundary}` }
}

test('profile picture: re-encoded to a 512px WebP and served', async () => {
  const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#3a92d0' } }).png().toBuffer()
  const { body, type } = multipart('me.png', 'image/png', png)
  const r = await app.inject({ method: 'PUT', url: '/api/account/avatar', payload: body, headers: { 'content-type': type, cookie, origin: ORIGIN } })
  assert.equal(r.statusCode, 200, r.body)
  const url = r.json().user.avatarUrl as string
  assert.match(url, /^\/api\/files\/avatars\/.+\.webp$/)
  const file = await app.inject({ method: 'GET', url })
  assert.equal(file.statusCode, 200)
  const meta = await sharp(file.rawPayload).metadata()
  assert.equal(meta.format, 'webp')
  assert.equal(meta.width, 512)

  const fake = multipart('evil.png', 'image/png', Buffer.from('<?php echo "not an image"; ?>'))
  const rejected = await app.inject({ method: 'PUT', url: '/api/account/avatar', payload: fake.body, headers: { 'content-type': fake.type, cookie, origin: ORIGIN } })
  assert.equal(rejected.statusCode, 400)
  assert.equal(rejected.json().error.code, 'bad-image')
})

test('changes from another site are refused', async () => {
  const r = await app.inject({ method: 'PATCH', url: '/api/account', payload: { name: 'Hacked' }, headers: { cookie, origin: 'https://evil.example' } })
  assert.equal(r.statusCode, 403)
})

test('Spotify: status, and linking when no Spotify app is set up', async () => {
  const s = await json('GET', '/api/spotify/status')
  assert.equal(s.json().linked, false)
  const c = await json('GET', '/api/spotify/connect')
  assert.equal(c.statusCode, 302)
  if (!s.json().configured) assert.equal(c.headers.location, `${ORIGIN}/?spotify=unavailable`)
  else assert.match(String(c.headers.location), /^https:\/\/accounts\.spotify\.com\/authorize\?/)
  const player = await json('GET', '/api/spotify/player')
  assert.equal(player.json().error.code, 'spotify-unlinked')
})

test('Spotify tokens are encrypted at rest', () => {
  const sealed = encrypt('BQD-access-token')
  assert.ok(!sealed.includes('BQD'))
  assert.equal(decrypt(sealed), 'BQD-access-token')
  const tampered = sealed.slice(0, -2) + (sealed.endsWith('A') ? 'BB' : 'AA')
  assert.throws(() => decrypt(tampered))
})

test('deactivate signs out everywhere; signing in brings the account back', async () => {
  const r = await json('POST', '/api/account/deactivate')
  assert.equal(r.statusCode, 204)
  assert.equal((await json('GET', '/api/account')).statusCode, 401)
  cookie = ''
  const back = await json('POST', '/api/auth/signin', { email, password })
  assert.equal(back.statusCode, 200)
  cookie = String(back.headers['set-cookie']).split(';')[0]
  assert.equal((await json('GET', '/api/account')).statusCode, 200)
})

test('delete removes the account for good', async () => {
  const r = await json('DELETE', '/api/account')
  assert.equal(r.statusCode, 204)
  cookie = ''
  const signin = await json('POST', '/api/auth/signin', { email, password })
  assert.equal(signin.statusCode, 401)
})
