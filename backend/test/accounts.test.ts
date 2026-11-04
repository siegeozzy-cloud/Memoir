import assert from 'node:assert/strict'
import { createCipheriv, randomBytes } from 'node:crypto'
import { after, before, test } from 'node:test'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { buildApp } from '../src/app.ts'
import { db, pool, runMigrations } from '../src/db/client.ts'
import { spotifyLinks, users } from '../src/db/schema.ts'
import { decrypt, encrypt } from '../src/lib/crypto.ts'
import { testOutbox } from '../src/lib/mailer.ts'
import { clearFailures, describeWait, recordFailure } from '../src/lib/throttle.ts'

// Runs against the development database (npm run db:up), with a fresh email each run.
// The whole account life: sign up → confirm email → sign in → profile → picture → deactivate → delete.

const app = await buildApp()
const ORIGIN = 'http://127.0.0.1:5173'
const email = `test+${Date.now()}@example.com`
let password = 'correct horse battery staple'
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
  // no mail server in tests, so the link would be printed in the terminal
  assert.deepEqual(ok.json(), { status: 'verify-email', email, delivery: 'console' })
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

test('the same session works as a token, for apps that can’t use the cookie', async () => {
  const signin = await json('POST', '/api/auth/signin', { email, password, remember: true })
  const token = signin.json().token as string
  assert.ok(token?.length > 20, 'sign-in hands back a token')

  // no cookie at all, just the token
  const bearer = { origin: ORIGIN, authorization: `Bearer ${token}` }
  const mine = await app.inject({ method: 'GET', url: '/api/account', headers: bearer })
  assert.equal(mine.statusCode, 200)
  assert.equal(mine.json().user.name, "José O'Brien-Nguyễn")

  // the WebSocket carries it in the sub-protocol, where a browser can set it
  const upgrade = await app.inject({
    method: 'GET',
    url: '/api/ws',
    headers: { origin: ORIGIN, connection: 'upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', 'sec-websocket-protocol': `memoir.v1, memoir.token.${token}` },
  })
  assert.notEqual(upgrade.statusCode, 401, 'the token in the sub-protocol signs the socket in')

  const nonsense = await app.inject({ method: 'GET', url: '/api/account', headers: { origin: ORIGIN, authorization: 'Bearer not-a-real-token' } })
  assert.equal(nonsense.statusCode, 401)
})

test('another site may not call the API', async () => {
  const r = await app.inject({ method: 'GET', url: '/api/account', headers: { origin: 'https://evil.example', cookie } })
  // the browser is told no, so its script never sees the answer
  assert.ok(!r.headers['access-control-allow-origin'])
  const allowed = await app.inject({ method: 'GET', url: '/api/account', headers: { origin: ORIGIN, cookie } })
  assert.equal(allowed.headers['access-control-allow-origin'], ORIGIN)
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

test('profile picture: re-encoded to a 512px JPEG and served', async () => {
  const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: '#3a92d0' } }).png().toBuffer()
  const { body, type } = multipart('me.png', 'image/png', png)
  const r = await app.inject({ method: 'PUT', url: '/api/account/avatar', payload: body, headers: { 'content-type': type, cookie, origin: ORIGIN } })
  assert.equal(r.statusCode, 200, r.body)
  const url = r.json().user.avatarUrl as string
  assert.match(url, /^\/api\/files\/avatars\/.+\.jpg$/)
  const file = await app.inject({ method: 'GET', url })
  assert.equal(file.statusCode, 200)
  const meta = await sharp(file.rawPayload).metadata()
  assert.equal(meta.format, 'jpeg')
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
  const c = await json('GET', '/api/spotify/authorize-url')
  assert.equal(c.statusCode, 200)
  if (!s.json().configured) assert.equal(c.json().url, null, 'no Spotify app set up, so nowhere to send them')
  else {
    const url = new URL(c.json().url)
    assert.equal(url.origin + url.pathname, 'https://accounts.spotify.com/authorize')
    // who the link is for travels encrypted in `state`, since the callback has no session of its own
    assert.ok(url.searchParams.get('state')?.startsWith('v1.'))
    assert.match(String(url.searchParams.get('redirect_uri')), /\/api\/spotify\/callback$/)
  }
  // a made-up state links nobody
  const forged = await app.inject({ method: 'GET', url: '/api/spotify/callback?code=x&state=not-a-real-state' })
  assert.equal(forged.statusCode, 302)
  assert.equal(forged.headers.location, `${ORIGIN}/?spotify=error`)
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

test('a stored Spotify token that no longer opens asks for a relink, not a server error', async () => {
  // What a regenerated TOKEN_KEY leaves behind: a link row whose tokens were sealed with the old
  // key. `decrypt` throws a plain error for that, which used to surface on every single button as
  // "Something went wrong on our side", with no way out of it.
  const me = await db.query.users.findFirst({ where: eq(users.email, email) })
  const stale = (plain: string) => {
    const iv = randomBytes(12)
    const c = createCipheriv('aes-256-gcm', randomBytes(32), iv) // a key that is not ours
    const data = Buffer.concat([c.update(plain, 'utf8'), c.final()])
    return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
  }
  await db.insert(spotifyLinks).values({
    userId: me!.id,
    spotifyUserId: 'spotify-user',
    accessToken: stale('access'),
    refreshToken: stale('refresh'),
    expiresAt: new Date(Date.now() + 3_600_000),
    scope: 'user-read-playback-state',
  })

  for (const [method, url] of [
    ['GET', '/api/spotify/player'],
    ['PUT', '/api/spotify/player/play'],
    ['POST', '/api/spotify/player/next'],
  ] as const) {
    const r = await json(method, url)
    assert.equal(r.statusCode, 409, `${method} ${url} answered ${r.statusCode}: ${r.body}`)
    assert.equal(r.json().error.code, 'spotify-unlinked', `${method} ${url}`)
  }

  // and the unreadable link is gone, so the app offers to link again rather than retrying forever
  assert.equal(await db.query.spotifyLinks.findFirst({ where: eq(spotifyLinks.userId, me!.id) }), undefined)
})

/** A sign-in from a given address, so the per-IP limit can be kept out of the way of these. */
const signInFrom = (payload: object, ip: string) =>
  app.inject({ method: 'POST', url: '/api/auth/signin', payload, headers: { origin: ORIGIN }, remoteAddress: ip })

test('guessing a password locks that account out, however many addresses the guesses come from', async () => {
  const target = `brute+${Date.now()}@example.com`
  const guess = { email: target, password: 'not the right one' }
  // every guess from a different address: the per-IP limit never fires, so what stops this can
  // only be the count held against the account itself
  const from = (i: number) => `10.80.0.${i + 1}`

  for (let i = 0; i < 5; i++) {
    const r = await signInFrom(guess, from(i))
    assert.equal(r.statusCode, 401, `guess ${i + 1} should still be allowed: ${r.body}`)
    assert.equal(r.json().error.code, 'wrong-credentials')
  }

  const locked = await signInFrom(guess, from(99))
  assert.equal(locked.statusCode, 429, locked.body)
  assert.equal(locked.json().error.code, 'too-many-attempts')
  assert.match(locked.json().error.message, /try again in/i)

  // nothing here says whether anyone has registered that address: the account doesn't exist
  clearFailures(`signin:${target}`)
})

test('a locked account refuses the right password too, and signing in clears the count', async () => {
  const key = `signin:${email}`
  const wrong = { email, password: 'definitely not the one' }
  clearFailures(key)

  for (let i = 0; i < 6; i++) await signInFrom(wrong, `10.81.0.${i + 1}`)
  const right = await signInFrom({ email, password }, '10.81.0.50')
  assert.equal(right.statusCode, 429, 'a lockout that the real password walks through is not a lockout')

  // a few wrong answers followed by the right one, and the slate is clean again
  clearFailures(key)
  for (let i = 0; i < 3; i++) await signInFrom(wrong, `10.82.0.${i + 1}`)
  const good = await signInFrom({ email, password }, '10.82.0.50')
  assert.equal(good.statusCode, 200, good.body)

  for (let i = 0; i < 5; i++) {
    const r = await signInFrom(wrong, `10.83.0.${i + 1}`)
    assert.equal(r.statusCode, 401, `the successful sign-in should have reset the count, but guess ${i + 1} was ${r.statusCode}`)
  }
  clearFailures(key)
})

test('the wait a person is told to wait is a sentence, and it grows', () => {
  const key = `unit:${Date.now()}`
  for (let i = 0; i < 5; i++) assert.equal(recordFailure(key), 0, 'the allowance comes first')
  const first = recordFailure(key)
  const second = recordFailure(key, Date.now() + first + 1)
  assert.ok(first > 0 && second > first, `each lockout should outlast the last: ${first} then ${second}`)
  clearFailures(key)

  assert.equal(describeWait(1000), '1 second')
  assert.equal(describeWait(45_000), '45 seconds')
  assert.equal(describeWait(5 * 60_000), '5 minutes')
})

test('a control call Spotify answers with a non-JSON body still works the button', async () => {
  // Seen in production: PUT /me/player/seek came back 200 with a short body that isn't JSON, and
  // `JSON.parse` threw a bare SyntaxError — a 500, and "Something went wrong on our side" under
  // every button. Nothing reads a control call's body, so it must not be able to fail the press.
  const me = await db.query.users.findFirst({ where: eq(users.email, email) })
  await db.insert(spotifyLinks).values({
    userId: me!.id,
    spotifyUserId: 'spotify-user',
    accessToken: encrypt('access'),
    refreshToken: encrypt('refresh'),
    expiresAt: new Date(Date.now() + 3_600_000),
    scope: 'user-read-playback-state',
  })

  const realFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL) =>
    String(url).includes('/me/player')
      ? new Response('bLI3JKDZTQ not json at all', { status: 200, headers: { 'content-type': 'text/plain' } })
      : realFetch(url)) as typeof fetch

  try {
    for (const [method, url] of [
      ['PUT', '/api/spotify/player/play'],
      ['POST', '/api/spotify/player/next'],
    ] as const) {
      const r = await json(method, url)
      assert.equal(r.statusCode, 204, `${method} ${url} answered ${r.statusCode}: ${r.body}`)
    }
    const seek = await json('PUT', '/api/spotify/player/seek', { positionMs: 5000 })
    assert.equal(seek.statusCode, 204, seek.body)

    // and a read of the same shape says "nothing playing" rather than falling over
    const player = await json('GET', '/api/spotify/player')
    assert.equal(player.statusCode, 200, player.body)
    assert.equal(player.json().playback, null)
  } finally {
    globalThis.fetch = realFetch
    await db.delete(spotifyLinks).where(eq(spotifyLinks.userId, me!.id))
  }
})

test('forgot password: the emailed link sets a new password and ends the old sessions', async () => {
  const next = 'a quite different passphrase'
  const wasSignedIn = cookie

  // the same answer for an address with no account, so the form can't be used to find one
  const nobody = await json('POST', '/api/auth/forgot-password', { email: `nobody+${Date.now()}@example.com` })
  const somebody = await json('POST', '/api/auth/forgot-password', { email })
  const a = nobody.json() as { status: string; delivery?: string }
  const b = somebody.json() as { status: string; delivery?: string }
  assert.equal(somebody.statusCode, 202)
  assert.equal(nobody.statusCode, somebody.statusCode)
  assert.equal(a.status, b.status)
  assert.equal(a.delivery, b.delivery)
  assert.match(testOutbox.at(-1)!.subject, /new Memoir password/)

  // the emailed link hands the token to the app rather than spending it
  const link = new URL(lastLink())
  const hop = await app.inject({ method: 'GET', url: link.pathname + link.search })
  assert.equal(hop.statusCode, 302)
  const token = new URL(String(hop.headers.location)).searchParams.get('reset')!
  assert.ok(token.length > 20, 'the app is handed the token itself')

  // a password that's too short is refused, and the link still works afterwards
  const short = await json('POST', '/api/auth/reset-password', { token, password: 'short' })
  assert.equal(short.statusCode, 400)
  assert.equal(short.json().error.field, 'password')

  assert.equal((await json('POST', '/api/auth/reset-password', { token, password: next })).statusCode, 204)
  assert.equal((await json('POST', '/api/auth/reset-password', { token, password: next })).statusCode, 400, 'the link works once')

  // the old password, and the session it had opened, are both finished with
  cookie = ''
  assert.equal((await json('POST', '/api/auth/signin', { email, password })).statusCode, 401)
  assert.equal((await app.inject({ method: 'GET', url: '/api/account', headers: { origin: ORIGIN, cookie: wasSignedIn } })).statusCode, 401)

  const fresh = await json('POST', '/api/auth/signin', { email, password: next, remember: true })
  assert.equal(fresh.statusCode, 200)
  password = next
  cookie = String(fresh.headers['set-cookie']).split(';')[0]
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


test('Cloudinary URLs name the resource type, so they resolve', async () => {
  // Delivery happens from /image/ or /video/; "auto" is an upload setting, and a URL built with it
  // 404s at Cloudinary. This caught nothing locally, where files are served from disk instead.
  const { urlFor } = await import('../src/lib/storage.ts')
  const { v2: cloudinary } = await import('cloudinary')
  cloudinary.config({ cloud_name: 'test-cloud', secure: true })

  const photo = urlFor('cl:memoir/media/photo', 'media', 'image')
  const clip = urlFor('cl:memoir/media/clip', 'media', 'video')
  const face = urlFor('cl:memoir/avatars/face', 'avatars')
  for (const [what, url] of [['photo', photo], ['clip', clip], ['avatar', face]] as const) {
    assert.doesNotMatch(url, /\/auto\/upload\//, `${what} must not be delivered from /auto/`)
  }
  assert.match(photo, /\/image\/upload\//)
  assert.match(clip, /\/video\/upload\//)
  assert.match(face, /\/image\/upload\//) // avatars are always pictures

  // a key that isn't Cloudinary's is still served by this API, whatever the kind
  assert.match(urlFor('abc.jpg', 'media', 'video'), /^\/api\/files\/media\/abc\.jpg$/)
})
