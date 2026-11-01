import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { buildApp } from '../src/app.ts'
import { db, pool, runMigrations } from '../src/db/client.ts'
import { users } from '../src/db/schema.ts'
import { testOutbox } from '../src/lib/mailer.ts'

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
  assert.match(message.attachments[0].url, /^\/api\/files\/media\/.+\.webp$/)

  const file = await app.inject({ method: 'GET', url: message.attachments[0].url })
  assert.equal(file.statusCode, 200)
  assert.equal((await sharp(file.rawPayload).metadata()).format, 'webp')
  assert.equal(file.headers['x-content-type-options'], 'nosniff')

  const theirs = await as(jack, 'GET', `/api/chat/conversations/${conversationId}/messages`)
  assert.equal(theirs.json().messages.at(-1).text, 'Look at this one')
  const list = await as(jack, 'GET', '/api/chat/conversations')
  assert.equal(list.json().conversations[0].unread, 1)
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
