import { ME_ID, strangers, users } from '../../mocks/people'
import { placeholderImage } from '../../shared/lib/placeholderImage'
import type { ChatEvent, ChatService } from './service'
import { DEFAULT_SETTINGS } from './themes'
import type { Attachment, Conversation, Message, MessageDraft } from './types'

// In-memory stand-in for the chat backend. State resets on reload.
// Like a real server, it pushes events for changes to conversations; it does not echo your
// own sent messages back (the caller already has the stored copy from sendMessage).

let seq = 0
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** [sender, minutes ago, text, placeholder image seeds] */
type Line = [string, number, string?, string[]?]

function seed() {
  const conversations: Conversation[] = []
  const messages = new Map<string, Message[]>()
  const add = (withId: string, unread: number, lines: Line[]) => {
    const id = `dm_${withId}`
    const list = lines.map(([senderId, ago, text, images = []]): Message => ({
      id: uid('msg'),
      conversationId: id,
      senderId,
      createdAt: minutesAgo(ago),
      text,
      attachments: images.map((s): Attachment => ({ id: uid('att'), kind: 'image', url: placeholderImage(s), name: `${s}.jpg`, width: 640, height: 480 })),
      status: 'read',
    }))
    messages.set(id, list)
    conversations.push({
      id,
      participantIds: [ME_ID, withId],
      unread,
      lastActivityAt: list[list.length - 1].createdAt,
      settings: { ...DEFAULT_SETTINGS },
    })
  }

  add('jack', 0, [
    ['jack', 60 * 30, 'Uploaded the beach set btw', ['beach1', 'beach2']],
    ['jack', 60 * 26, 'Yo, are you still in Manila this weekend?'],
    ['me', 60 * 26 - 3, 'Yep, until Sunday. Night market again?'],
    ['jack', 60 * 25, 'Obviously 😄 I’ll tag you in the album after'],
    ['me', 42, undefined, ['market1']],
    ['me', 41, 'Found this from last time. Still my favourite shot'],
    ['jack', 12, 'Pinning that one on the globe'],
  ])
  add('mara', 2, [
    ['me', 300, 'Did you get home ok?'],
    ['mara', 20, 'Sorry, fell asleep 😅'],
    ['mara', 19, 'Sending the Mumbai photos tonight'],
  ])
  add('theo', 1, [
    ['me', 60 * 5, 'How was the drive?'],
    ['theo', 89, 'Red Centre, round two?', ['desert1']],
  ])
  add('lia', 0, [
    ['lia', 60 * 24 * 3, 'Happy birthday!! 🎉'],
    ['me', 60 * 24 * 3 - 10, 'Thank you!! Pictures soon'],
  ])
  return { conversations, messages }
}

class MockChatService implements ChatService {
  readonly meId = ME_ID
  private listeners = new Set<(e: ChatEvent) => void>()
  private conversations: Conversation[]
  private messages: Map<string, Message[]>

  constructor() {
    const s = seed()
    this.conversations = s.conversations
    this.messages = s.messages
  }

  private emit(event: ChatEvent) {
    for (const l of this.listeners) l(event)
  }

  private find(id: string) {
    const c = this.conversations.find((x) => x.id === id)
    if (!c) throw new Error(`No conversation ${id}`)
    return c
  }

  private changed(c: Conversation) {
    const copy = structuredClone(c)
    this.emit({ type: 'conversation', conversation: copy })
    return copy
  }

  async listFriends() {
    return structuredClone(users)
  }

  async searchUsers(query: string) {
    const q = norm(query)
    if (!q) return []
    return structuredClone([...users, ...strangers].filter((u) => norm(u.name).includes(q)).slice(0, 8))
  }

  async listConversations() {
    return structuredClone(this.conversations)
  }

  async listMessages(conversationId: string) {
    return structuredClone(this.messages.get(conversationId) ?? [])
  }

  async openConversationWith(userId: string) {
    const existing = this.conversations.find((c) => c.participantIds.length === 2 && c.participantIds.includes(userId))
    if (existing) return structuredClone(existing)
    const c: Conversation = {
      id: `dm_${userId}`,
      participantIds: [ME_ID, userId],
      unread: 0,
      lastActivityAt: new Date().toISOString(),
      settings: { ...DEFAULT_SETTINGS },
    }
    this.conversations.push(c)
    this.messages.set(c.id, [])
    return this.changed(c)
  }

  async sendMessage(conversationId: string, draft: MessageDraft) {
    await delay(350) // stands in for the upload/round trip
    const c = this.find(conversationId)
    const message: Message = {
      id: uid('msg'),
      conversationId,
      senderId: ME_ID,
      createdAt: new Date().toISOString(),
      text: draft.text?.trim() || undefined,
      // a real backend would upload the files and return their URLs
      attachments: (draft.files ?? []).map((f) => ({
        id: uid('att'),
        kind: f.type.startsWith('video/') ? 'video' : 'image',
        url: URL.createObjectURL(f),
        name: f.name,
      })),
      status: 'sent',
    }
    this.messages.get(conversationId)!.push(message)
    c.lastActivityAt = message.createdAt
    this.changed(c)
    return structuredClone(message)
  }

  async forwardMessage(messageId: string, toConversationId: string) {
    await delay(250)
    const original = [...this.messages.values()].flat().find((m) => m.id === messageId)
    if (!original) throw new Error(`No message ${messageId}`)
    const c = this.find(toConversationId)
    const message: Message = {
      id: uid('msg'),
      conversationId: toConversationId,
      senderId: ME_ID,
      createdAt: new Date().toISOString(),
      text: original.text,
      // the server would copy the stored files; here the copy shares the original's URLs
      attachments: original.attachments.map((a) => ({ ...a, id: uid('att') })),
      status: 'sent',
      forwarded: true,
    }
    this.messages.get(toConversationId)!.push(message)
    c.lastActivityAt = message.createdAt
    this.changed(c)
    return structuredClone(message)
  }

  async deleteMessage(conversationId: string, messageId: string, forEveryone: boolean) {
    const list = this.messages.get(conversationId)
    if (!list) return
    const m = list.find((x) => x.id === messageId)
    if (forEveryone && m?.senderId !== ME_ID) throw new Error('Only your own messages can be unsent')
    this.messages.set(conversationId, list.filter((x) => x.id !== messageId))
    // attachment URLs aren't revoked: a forwarded copy may still show them
  }

  async markRead(conversationId: string) {
    const c = this.find(conversationId)
    if (!c.unread) return
    c.unread = 0
    this.changed(c)
  }

  async updateSettings(conversationId: string, patch: Partial<Conversation['settings']>) {
    const c = this.find(conversationId)
    c.settings = { ...c.settings, ...patch }
    return this.changed(c)
  }

  async deleteConversation(conversationId: string) {
    for (const m of this.messages.get(conversationId) ?? []) {
      for (const a of m.attachments) if (a.url.startsWith('blob:')) URL.revokeObjectURL(a.url)
    }
    this.messages.delete(conversationId)
    this.conversations = this.conversations.filter((c) => c.id !== conversationId)
    this.emit({ type: 'conversation-deleted', conversationId })
  }

  subscribe(listener: (e: ChatEvent) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}

export const mockChatService: ChatService = new MockChatService()
