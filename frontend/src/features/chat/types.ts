// Chat data model. Shaped so the mock service can be swapped for a real backend
// (REST/WebSocket signalling + WebRTC data channels) without touching the UI.

export type Attachment = {
  id: string
  kind: 'image' | 'video'
  url: string
  name: string
  width?: number
  height?: number
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed'

export type Message = {
  id: string
  conversationId: string
  senderId: string
  /** ISO 8601 */
  createdAt: string
  text?: string
  attachments: Attachment[]
  status: MessageStatus
  /** Sent on from another conversation. */
  forwarded?: boolean
}

export type ConversationSettings = {
  /** Shown instead of the other person's name, only to you. */
  nickname?: string
  /** Key into CHAT_COLORS. Colours your own bubbles. */
  color: string
  /** Key into CHAT_BACKGROUNDS. */
  background: string
}

export type Conversation = {
  id: string
  /** Direct messages for now: [me, them]. Group chats would list more. */
  participantIds: string[]
  unread: number
  /** ISO 8601, for ordering. */
  lastActivityAt: string
  settings: ConversationSettings
}

export type MessageDraft = {
  text?: string
  files?: File[]
}
