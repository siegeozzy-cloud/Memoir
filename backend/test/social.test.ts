import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { buildApp } from '../src/app.ts'
import { db, pool, runMigrations } from '../src/db/client.ts'
import { users } from '../src/db/schema.ts'
import { hasSpotifyLink } from '../src/features/spotify/client.ts'
import { testOutbox } from '../src/lib/mailer.ts'
import { announcePresence } from '../src/lib/realtime.ts'
import { cachedUser, friendsOf, unwatchUser, watchUser } from '../src/lib/user-cache.ts'

// Two people, start to finish: becoming friends, messaging with a photo, forwarding, unsending,
// posting a memory with a tag, and who may see what. Runs against the development database.

const app = await buildApp()
const ORIGIN = 'http://127.0.0.1:5173'
const password = 'correct horse battery staple'
const stamp = Date.now()

type Person = { email: string; cookie: string; id: string; uniqueId: string; name: string }

async function signUp(name: string): Promise<Person> {
  const email = `${name.toLowerCase()}.${stamp}@example.com`
  const up = await app.inject({ method: 'POST', url: '/api/auth/signup', payload: { name, email, password, acceptedTerms: true }, headers: { origin: ORIGIN }, remoteAddress: `10.1.0.${Math.floor(Math.random() * 250) + 1}` })
  assert.equal(up.statusCode, 202, up.body)
  const link = new URL(/https?:\/\/\S+/.exec(testOutbox.at(-1)!.text)![0])
  await app.inject({ method: 'GET', url: link.pathname + link.search })
  const inn = await app.inject({ method: 'POST', url: '/api/auth/signin', payload: { email, password }, headers: { origin: ORIGIN } })
  assert.equal(inn.statusCode, 200, inn.body)
  const cookie = String(inn.headers['set-cookie']).split(';')[0]
  const me = await db.query.users.findFirst({ where: eq(users.email, email) })
  return { email, cookie, id: me!.id, uniqueId: me!.uniqueId, name }
}

const as = (who: Person, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, payload, headers: { origin: ORIGIN, cookie: who.cookie } })

/** A multipart body: text fields plus files, the way the browser sends them. */
function form(fields: Record<string, string>, files: { name: string; type: string; data: Buffer }[] = []) {
  const boundary = '----memoir' + Math.random().toString(36).slice(2)
  const parts: Buffer[] = []
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`))
  }
  for (const f of files) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`), f.data, Buffer.from('\r\n'))
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`))
  return { body: Buffer.concat(parts), type: `multipart/form-data; boundary=${boundary}` }
}

const upload = (who: Person, method: 'POST' | 'PATCH', url: string, fields: Record<string, string>, files: Parameters<typeof form>[1] = []) => {
  const { body, type } = form(fields, files)
  return app.inject({ method, url, payload: body, headers: { origin: ORIGIN, cookie: who.cookie, 'content-type': type } })
}

const photo = async (colour: string) => ({ name: 'shot.png', type: 'image/png', data: await sharp({ create: { width: 800, height: 600, channels: 3, background: colour } }).png().toBuffer() })

let maria: Person
let jack: Person
let stranger: Person
let conversationId = ''
let messageId = ''
let memoryId = ''

before(async () => {
  await runMigrations()
  ;[maria, jack, stranger] = await Promise.all([signUp('Maria'), signUp('Jack'), signUp('Nosy')])
})
after(async () => {
  for (const who of [maria, jack, stranger]) await as(who, 'DELETE', '/api/account')
  await app.close()
  await pool.end()
})

test('people are found by name or by their unique ID', async () => {
  const byName = await as(maria, 'GET', `/api/friends/search?q=${encodeURIComponent(jack.name)}`)
  assert.equal(byName.statusCode, 200)
  const found = byName.json().results.find((r: { user: { id: string } }) => r.user.id === jack.id)
  assert.equal(found.relation, 'none')
  assert.equal(found.uniqueId, undefined, 'a name search shouldn’t hand out IDs')

  for (const typed of [jack.uniqueId, jack.uniqueId.toLowerCase(), jack.uniqueId.replace(/-/g, '')]) {
    const r = await as(maria, 'GET', `/api/friends/search?q=${encodeURIComponent(typed)}`)
    assert.equal(r.json().results[0]?.user.id, jack.id, typed)
    assert.equal(r.json().results[0].uniqueId, jack.uniqueId)
  }
})

test('a friend request waits for the other person to accept', async () => {
  const sent = await as(maria, 'POST', '/api/friends/requests', { userId: jack.id })
  assert.equal(sent.statusCode, 202)
  assert.deepEqual(sent.json(), { status: 'sent' })

  // not friends yet: no messaging
  const early = await as(maria, 'POST', '/api/chat/conversations', { userId: jack.id })
  assert.equal(early.statusCode, 403)
  assert.equal(early.json().error.code, 'not-friends')

  const waiting = await as(jack, 'GET', '/api/friends/requests')
  assert.equal(waiting.json().incoming.length, 1)
  assert.equal(waiting.json().incoming[0].user.name, 'Maria')

  const accepted = await as(jack, 'POST', `/api/friends/requests/${waiting.json().incoming[0].id}/accept`)
  assert.equal(accepted.statusCode, 200)
  const friends = await as(maria, 'GET', '/api/friends')
  assert.deepEqual(friends.json().friends.map((f: { id: string }) => f.id), [jack.id])
  // nobody has a tab open, so they look offline to each other
  assert.equal(friends.json().friends[0].status, 'offline')
})

test('asking someone who already asked you makes you friends at once', async () => {
  await as(stranger, 'POST', '/api/friends/requests', { userId: maria.id })
  const back = await as(maria, 'POST', '/api/friends/requests', { userId: stranger.id })
  assert.deepEqual(back.json(), { status: 'friend' })
  await as(maria, 'DELETE', `/api/friends/${stranger.id}`) // part ways again for the tests below
})

test('a message with a photo, with the photo re-encoded and served', async () => {
  const open = await as(maria, 'POST', '/api/chat/conversations', { userId: jack.id })
  assert.equal(open.statusCode, 200, open.body)
  conversationId = open.json().id
  assert.deepEqual([...open.json().participantIds].sort(), [maria.id, jack.id].sort())

  const sent = await upload(maria, 'POST', `/api/chat/conversations/${conversationId}/messages`, { text: 'Look at this one' }, [await photo('#3a92d0')])
  assert.equal(sent.statusCode, 200, sent.body)
  const message = sent.json()
  messageId = message.id
  assert.equal(message.text, 'Look at this one')
  assert.equal(message.attachments.length, 1)
  assert.match(message.attachments[0].url, /^\/api\/files\/media\/.+\.jpg$/)

  const file = await app.inject({ method: 'GET', url: message.attachments[0].url })
  assert.equal(file.statusCode, 200)
  assert.equal((await sharp(file.rawPayload).metadata()).format, 'jpeg')
  assert.equal(file.headers['x-content-type-options'], 'nosniff')

  const theirs = await as(jack, 'GET', `/api/chat/conversations/${conversationId}/messages`)
  assert.equal(theirs.json().messages.at(-1).text, 'Look at this one')
  const list = await as(jack, 'GET', '/api/chat/conversations')
  assert.equal(list.json().conversations[0].unread, 1)

  // a photo on its own, with nothing written: the browser sends no text field at all for this
  const bare = await upload(maria, 'POST', `/api/chat/conversations/${conversationId}/messages`, {}, [await photo('#d04a3a')])
  assert.equal(bare.statusCode, 200, bare.body)
  assert.equal(bare.json().text, undefined)
  assert.equal(bare.json().attachments.length, 1)
})

test('only the people in a conversation can read it', async () => {
  const peek = await as(stranger, 'GET', `/api/chat/conversations/${conversationId}/messages`)
  assert.equal(peek.statusCode, 404)
  const butt = await upload(stranger, 'POST', `/api/chat/conversations/${conversationId}/messages`, { text: 'hello?' })
  assert.equal(butt.statusCode, 404)
})

test('reading marks it read, and the sender sees "Seen"', async () => {
  await as(jack, 'POST', `/api/chat/conversations/${conversationId}/read`)
  const list = await as(jack, 'GET', '/api/chat/conversations')
  assert.equal(list.json().conversations[0].unread, 0)
  const mine = await as(maria, 'GET', `/api/chat/conversations/${conversationId}/messages`)
  assert.equal(mine.json().messages.at(-1).status, 'read')
})

test('a nickname and chat colour are only seen by the person who set them', async () => {
  const saved = await as(maria, 'PATCH', `/api/chat/conversations/${conversationId}`, { nickname: 'Jackie', color: 'violet' })
  assert.equal(saved.json().settings.nickname, 'Jackie')
  const theirs = await as(jack, 'GET', '/api/chat/conversations')
  assert.equal(theirs.json().conversations[0].settings.nickname, undefined)
  assert.equal(theirs.json().conversations[0].settings.color, 'blue')
})

test('forwarding copies a message into another conversation', async () => {
  await as(maria, 'POST', '/api/friends/requests', { userId: stranger.id })
  const waiting = await as(stranger, 'GET', '/api/friends/requests')
  await as(stranger, 'POST', `/api/friends/requests/${waiting.json().incoming[0].id}/accept`)
  const other = await as(maria, 'POST', '/api/chat/conversations', { userId: stranger.id })

  const copy = await as(maria, 'POST', `/api/chat/messages/${messageId}/forward`, { conversationId: other.json().id })
  assert.equal(copy.statusCode, 200, copy.body)
  assert.equal(copy.json().forwarded, true)
  assert.equal(copy.json().attachments.length, 1)
  assert.equal(copy.json().text, 'Look at this one')
})

test('deleting for you leaves it with the other person; unsending takes it from both', async () => {
  const mine = await upload(maria, 'POST', `/api/chat/conversations/${conversationId}/messages`, { text: 'Only for me to lose' })
  const theirs = await upload(jack, 'POST', `/api/chat/conversations/${conversationId}/messages`, { text: 'Jack’s message' })

  // Maria hides Jack's message: gone for her, still there for him
  const hidden = await as(maria, 'DELETE', `/api/chat/messages/${theirs.json().id}`)
  assert.equal(hidden.statusCode, 204)
  const hers = await as(maria, 'GET', `/api/chat/conversations/${conversationId}/messages`)
  assert.ok(!hers.json().messages.some((m: { id: string }) => m.id === theirs.json().id))
  const his = await as(jack, 'GET', `/api/chat/conversations/${conversationId}/messages`)
  assert.ok(his.json().messages.some((m: { id: string }) => m.id === theirs.json().id))

  // you can't unsend someone else's message
  const nope = await as(maria, 'DELETE', `/api/chat/messages/${theirs.json().id}?forEveryone=true`)
  assert.equal(nope.statusCode, 403)

  const unsent = await as(maria, 'DELETE', `/api/chat/messages/${mine.json().id}?forEveryone=true`)
  assert.equal(unsent.statusCode, 204)
  const after = await as(jack, 'GET', `/api/chat/conversations/${conversationId}/messages`)
  assert.ok(!after.json().messages.some((m: { id: string }) => m.id === mine.json().id))
})

test('deleting a conversation clears it for you only', async () => {
  const gone = await as(maria, 'DELETE', `/api/chat/conversations/${conversationId}`)
  assert.equal(gone.statusCode, 204)
  assert.ok(!(await as(maria, 'GET', '/api/chat/conversations')).json().conversations.some((c: { id: string }) => c.id === conversationId))
  assert.ok((await as(jack, 'GET', '/api/chat/conversations')).json().conversations.some((c: { id: string }) => c.id === conversationId))

  // a new message brings it back, without the old ones
  await upload(jack, 'POST', `/api/chat/conversations/${conversationId}/messages`, { text: 'Still here?' })
  const back = await as(maria, 'GET', `/api/chat/conversations/${conversationId}/messages`)
  assert.deepEqual(back.json().messages.map((m: { text: string }) => m.text), ['Still here?'])
})

const place = { name: 'Manila', country: 'Philippines', countryCode: 'PH', lat: 14.6, lon: 120.98 }

test('a post is visible to the owner and the people tagged, and to nobody else', async () => {
  const posted = await upload(maria, 'POST', '/api/memories', { draft: JSON.stringify({ place, title: 'Manila nights', taggedIds: [jack.id] }) }, [await photo('#f6a96b'), await photo('#2fa866')])
  assert.equal(posted.statusCode, 200, posted.body)
  memoryId = posted.json().id
  assert.equal(posted.json().items.length, 2)
  assert.deepEqual(posted.json().taggedIds, [jack.id])
  assert.equal(posted.json().place.countryCode, 'PH')

  assert.ok((await as(jack, 'GET', '/api/memories')).json().memories.some((m: { id: string }) => m.id === memoryId))
  assert.ok(!(await as(stranger, 'GET', '/api/memories')).json().memories.some((m: { id: string }) => m.id === memoryId))
})

test('only friends can be tagged', async () => {
  const outsider = await upload(jack, 'POST', '/api/memories', { draft: JSON.stringify({ place, taggedIds: [stranger.id] }) }, [await photo('#8b5cf6')])
  assert.equal(outsider.statusCode, 400)
  assert.equal(outsider.json().error.code, 'not-friends')
})

test('only the owner can edit a post, and it keeps at least one photo', async () => {
  const theirs = await upload(jack, 'PATCH', `/api/memories/${memoryId}`, { patch: JSON.stringify({ title: 'Mine now' }) })
  assert.equal(theirs.statusCode, 403)

  const current = (await as(maria, 'GET', '/api/memories')).json().memories.find((m: { id: string }) => m.id === memoryId)
  const all = current.items.map((i: { id: string }) => i.id)
  const empty = await upload(maria, 'PATCH', `/api/memories/${memoryId}`, { patch: JSON.stringify({ removeItemIds: all }) })
  assert.equal(empty.statusCode, 400)
  assert.equal(empty.json().error.code, 'empty')

  const edited = await upload(maria, 'PATCH', `/api/memories/${memoryId}`, { patch: JSON.stringify({ title: 'Manila, take two', removeItemIds: [all[0]], taggedIds: [] }) }, [await photo('#e0559a')])
  assert.equal(edited.statusCode, 200, edited.body)
  assert.equal(edited.json().title, 'Manila, take two')
  assert.equal(edited.json().items.length, 2)
  assert.deepEqual(edited.json().taggedIds, [])
  // untagged: it's off Jack's globe
  assert.ok(!(await as(jack, 'GET', '/api/memories')).json().memories.some((m: { id: string }) => m.id === memoryId))
})

test('Recently Deleted: trashed, restored, then deleted for good', async () => {
  await as(maria, 'POST', '/api/memories/trash', { ids: [memoryId] })
  const trashed = (await as(maria, 'GET', '/api/memories')).json().memories.find((m: { id: string }) => m.id === memoryId)
  assert.ok(trashed.deletedAt, 'kept, with the date it was deleted')

  await as(maria, 'POST', '/api/memories/restore', { ids: [memoryId] })
  assert.ok(!(await as(maria, 'GET', '/api/memories')).json().memories.find((m: { id: string }) => m.id === memoryId).deletedAt)

  // deleting for good only works from Recently Deleted
  await as(maria, 'POST', '/api/memories/purge', { ids: [memoryId] })
  assert.ok((await as(maria, 'GET', '/api/memories')).json().memories.some((m: { id: string }) => m.id === memoryId))

  await as(maria, 'POST', '/api/memories/trash', { ids: [memoryId] })
  await as(maria, 'POST', '/api/memories/purge', { ids: [memoryId] })
  assert.ok(!(await as(maria, 'GET', '/api/memories')).json().memories.some((m: { id: string }) => m.id === memoryId))
})

test('a file over the limit is refused, and says which file and what the limit is', async () => {
  // the bytes never have to be a real picture: the limit is reached before anything decodes them
  const huge = (mb: number) => ({ name: 'enormous.jpg', type: 'image/jpeg', data: Buffer.alloc(mb * 1024 * 1024, 7) })
  const place = JSON.stringify({ place: { name: 'Manila', country: 'Philippines', lat: 14.6, lon: 120.98 } })

  const post = await upload(maria, 'POST', '/api/memories', { draft: place }, [huge(16)])
  assert.equal(post.statusCode, 413, post.body)
  assert.equal(post.json().error.code, 'too-large')
  assert.match(post.json().error.message, /enormous\.jpg/, 'names the file that was too big')
  assert.match(post.json().error.message, /15 MB/, 'states the limit')

  // a message may carry more, because videos are stored as they arrive rather than re-encoded
  const message = await upload(maria, 'POST', `/api/chat/conversations/${conversationId}/messages`, {}, [huge(26)])
  assert.equal(message.statusCode, 413, message.body)
  assert.match(message.json().error.message, /25 MB/)

  // and a file inside both limits is still accepted
  const ok = await upload(maria, 'POST', `/api/chat/conversations/${conversationId}/messages`, {}, [await photo('#334455')])
  assert.equal(ok.statusCode, 200, ok.body)
})

test('a message is capped on how many files and how much they come to, not just each one', async () => {
  // Each file being under 25 MB is not enough on its own. A video is stored as it arrives, and the
  // server forwarding it to Cloudinary is metered outbound traffic — so ten at the limit would be a
  // quarter of a gigabyte of the monthly allowance for one message, and this route used to allow
  // twenty by taking readMultipart's default. See lib/uploads.ts and docs/deploy.md step 9.
  const url = `/api/chat/conversations/${conversationId}/messages`
  const chunk = (mb: number, i: number) => ({ name: `clip${i}.jpg`, type: 'image/jpeg', data: Buffer.alloc(mb * 1024 * 1024, 7) })

  // eleven small files: each one fine, one too many
  const tooMany = await upload(maria, 'POST', url, {}, Array.from({ length: 11 }, (_, i) => chunk(1, i)))
  assert.equal(tooMany.statusCode, 413, tooMany.body)
  assert.equal(tooMany.json().error.code, 'too-many')
  assert.match(tooMany.json().error.message, /10 files/, 'says how many are allowed')

  // three files, each inside the 25 MB single-file limit, but 72 MB together
  const tooMuch = await upload(maria, 'POST', url, {}, Array.from({ length: 3 }, (_, i) => chunk(24, i)))
  assert.equal(tooMuch.statusCode, 413, tooMuch.body)
  assert.equal(tooMuch.json().error.code, 'too-large')
  assert.match(tooMuch.json().error.message, /60 MB together/, 'states the limit for the lot')

  // and the same number of files, inside the total, still goes through
  const fine = await upload(maria, 'POST', url, {}, [await photo('#667788'), await photo('#889900')])
  assert.equal(fine.statusCode, 200, fine.body)
})

test('a list already held is answered with 304, not sent again', async () => {
  // something of her own, so her list and a stranger's can't be the same bytes
  const mine = await upload(maria, 'POST', '/api/memories', { draft: JSON.stringify({ place: { name: 'Cebu', country: 'Philippines', lat: 10.3, lon: 123.9 } }) }, [await photo('#206020')])
  assert.equal(mine.statusCode, 200, mine.body)

  const first = await as(maria, 'GET', '/api/memories')
  assert.equal(first.statusCode, 200)
  const etag = first.headers.etag as string
  assert.ok(etag, 'the list carries an ETag')
  assert.equal(first.headers['cache-control'], 'private, no-cache')

  const again = await app.inject({ method: 'GET', url: '/api/memories', headers: { origin: ORIGIN, cookie: maria.cookie, 'if-none-match': etag } })
  assert.equal(again.statusCode, 304, 'an unchanged list costs nothing to re-fetch')
  assert.equal(again.body, '')

  // the tag is a hash of the answer, so one account's can never unlock another's list
  const theirs = await app.inject({ method: 'GET', url: '/api/memories', headers: { origin: ORIGIN, cookie: stranger.cookie, 'if-none-match': etag } })
  assert.equal(theirs.statusCode, 200, 'a tag from an account with a different list must not be honoured')
  assert.ok(!theirs.json().memories.length, 'and the stranger still sees nothing of hers')

  // posting again changes the list, so the old tag stops matching
  await upload(maria, 'POST', '/api/memories', { draft: JSON.stringify({ place: { name: 'Davao', country: 'Philippines', lat: 7.1, lon: 125.6 } }) }, [await photo('#602020')])
  const stale = await app.inject({ method: 'GET', url: '/api/memories', headers: { origin: ORIGIN, cookie: maria.cookie, 'if-none-match': etag } })
  assert.equal(stale.statusCode, 200, 'a changed list must be sent in full')
})

test('a connected person costs no queries until they actually do something', async () => {
  // The Spotify sweep runs every ten seconds for as long as *anybody* is connected, and presence is
  // announced on every track change. If either of those reads the database, a Postgres that
  // suspends itself when idle never gets the chance — so the free plan's monthly compute goes on a
  // timer rather than on people using the app, and one client left connected overnight spends it
  // all. See lib/user-cache.ts and docs/deploy.md step 8.
  const row = await db.query.users.findFirst({ where: eq(users.id, maria.id) })
  watchUser(row!)
  // the first look at each is allowed to read: the caches warm up over the first sweep or two
  await friendsOf(maria.id)
  await hasSpotifyLink(maria.id)

  const real = pool.query.bind(pool)
  let queries = 0
  Object.defineProperty(pool, 'query', {
    configurable: true,
    value: (...args: unknown[]) => {
      queries++
      return (real as (...a: unknown[]) => unknown)(...args)
    },
  })
  try {
    // what a sweep plus a track change does for one connected person, a few times over
    for (let i = 0; i < 3; i++) {
      assert.ok(await cachedUser(maria.id), 'the row should still be held')
      assert.ok((await friendsOf(maria.id)).includes(jack.id), 'and so should the friend list it fans out to')
      await hasSpotifyLink(maria.id)
      await announcePresence(maria.id)
    }
    assert.equal(queries, 0, `an idle connected person should cost nothing, but that was ${queries} quer${queries === 1 ? 'y' : 'ies'}`)
  } finally {
    Reflect.deleteProperty(pool, 'query')
    unwatchUser(maria.id)
  }

  // and once they are gone, nothing of theirs is kept: the next look has to read again
  Object.defineProperty(pool, 'query', {
    configurable: true,
    value: (...args: unknown[]) => {
      queries++
      return (real as (...a: unknown[]) => unknown)(...args)
    },
  })
  try {
    await friendsOf(maria.id)
    assert.ok(queries > 0, 'dropping someone on disconnect is what keeps this bounded')
  } finally {
    Reflect.deleteProperty(pool, 'query')
  }
})

test('the keep-alive route answers without touching the database', async () => {
  const ping = await app.inject({ method: 'GET', url: '/api/ping' })
  assert.equal(ping.statusCode, 200)
  assert.deepEqual(ping.json(), { ok: true })
  // no session needed either: the cron job can't sign in
  assert.equal(ping.headers['set-cookie'], undefined)

  // /api/health is the deeper one, and does check the database
  const health = await app.inject({ method: 'GET', url: '/api/health' })
  assert.deepEqual(health.json(), { ok: true, db: true })
})

test('calls: the app is given STUN, and TURN credentials when one is set up', async () => {
  const r = await as(maria, 'GET', '/api/calls/ice')
  assert.equal(r.statusCode, 200)
  const { iceServers, turnConfigured } = r.json()
  assert.ok(iceServers[0].urls.length, 'at least one STUN server')
  if (turnConfigured) {
    const turn = iceServers.at(-1)
    for (const url of [turn.urls].flat()) assert.match(url, /^turns?:/)
    assert.ok(turn.username && turn.credential, 'the relay is given something to check')
    // coturn's shared-secret mode puts an expiry in the username; a hosted relay uses a fixed one
    const [maybeExpiry] = String(turn.username).split(':')
    if (/^\d{10}$/.test(maybeExpiry)) assert.ok(Number(maybeExpiry) > Date.now() / 1000, 'not already expired')
  }
})

test('signed out, nothing opens', async () => {
  for (const url of ['/api/friends', '/api/chat/conversations', '/api/memories', '/api/calls/ice']) {
    const r = await app.inject({ method: 'GET', url })
    assert.equal(r.statusCode, 401, url)
  }
})
