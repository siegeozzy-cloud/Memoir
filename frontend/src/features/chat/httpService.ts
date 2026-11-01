import { api } from '../../shared/lib/api'
import { onChannel } from '../../shared/lib/socket'
import type { User } from '../../shared/types'
import type { ChatEvent, ChatService } from './service'
import type { Conversation, Message, MessageDraft } from './types'

// The real messaging backend (../backend, /api/chat and /api/friends). Text and photos go through the
// server, so there's history, search and unread counts; calls go device-to-device (features/calls).

export function makeHttpChatService(meId: string): ChatService {
  /** The last friends list fetched, so "Start a Conversation" can search it without a round trip. */
  let friends: User[] = []

  return {
    meId,

    async listFriends() {
      if (!meId) return []
      friends = (await api<{ friends: User[] }>('/friends')).friends
      return friends
    },

    /** You can only message friends, so this searches the people you have. */
    async searchUsers(query: string) {
      const q = query.trim().toLowerCase()
      if (!q) return []
      return friends.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 8)
    },

    async listConversations() {
      if (!meId) return []
      return (await api<{ conversations: Conversation[] }>('/chat/conversations')).conversations
    },

    async listMessages(conversationId) {
      return (await api<{ messages: Message[] }>(`/chat/conversations/${conversationId}/messages`)).messages
    },

    openConversationWith: (userId) => api<Conversation>('/chat/conversations', { method: 'POST', json: { userId } }),

    sendMessage(conversationId, draft: MessageDraft) {
      const form = new FormData()
      if (draft.text) form.append('text', draft.text)
      for (const file of draft.files ?? []) form.append('files', file)
      return api<Message>(`/chat/conversations/${conversationId}/messages`, { method: 'POST', form })
    },

    forwardMessage: (messageId, toConversationId) => api<Message>(`/chat/messages/${messageId}/forward`, { method: 'POST', json: { conversationId: toConversationId } }),

    deleteMessage: (_conversationId, messageId, forEveryone) => api(`/chat/messages/${messageId}?forEveryone=${forEveryone}`, { method: 'DELETE' }),

    markRead: (conversationId) => api(`/chat/conversations/${conversationId}/read`, { method: 'POST' }),

    updateSettings: (conversationId, patch) => api<Conversation>(`/chat/conversations/${conversationId}`, { method: 'PATCH', json: patch }),

    deleteConversation: (conversationId) => api(`/chat/conversations/${conversationId}`, { method: 'DELETE' }),

    subscribe(listener: (event: ChatEvent) => void) {
      const offChat = onChannel('chat', (push) => {
        // 'notification' is for the pop-up tab, handled in App, not here
        const event = push.event as (ChatEvent | { type: 'notification' }) | undefined
        if (event && event.type !== 'notification') listener(event)
      })
      // someone accepted, added or removed you: the people bar reloads
      const offFriends = onChannel('friends', () => listener({ type: 'friends-changed' }))
      return () => {
        offChat()
        offFriends()
      }
    },
  }
}
