import type { User } from '../../shared/types'
import type { Conversation, ConversationSettings, Message, MessageDraft } from './types'

/** Pushed by the backend (a WebSocket in production, the mock here). */
export type ChatEvent =
  | { type: 'message'; message: Message }
  | { type: 'conversation'; conversation: Conversation }
  | { type: 'conversation-deleted'; conversationId: string }
  | { type: 'message-deleted'; conversationId: string; messageId: string }
  | { type: 'presence'; user: User }

/**
 * Everything the chat UI needs from a backend. The UI only talks to this interface;
 * `mockChatService` implements it in memory until the real server exists.
 */
export interface ChatService {
  readonly meId: string
  /** People you can message (friends). */
  listFriends(): Promise<User[]>
  /** Anyone matching the query, for "Start a Conversation". */
  searchUsers(query: string): Promise<User[]>
  listConversations(): Promise<Conversation[]>
  listMessages(conversationId: string): Promise<Message[]>
  /** Returns the existing direct conversation with this user, or creates one. */
  openConversationWith(userId: string): Promise<Conversation>
  /** Resolves with the stored message (real id, uploaded attachment URLs). */
  sendMessage(conversationId: string, draft: MessageDraft): Promise<Message>
  /** Sends a copy of a message (text and attachments) to another conversation. */
  forwardMessage(messageId: string, toConversationId: string): Promise<Message>
  /**
   * Removes a message from your view of the conversation. `forEveryone` (your own messages only) unsends it,
   * so the other person loses it too; they get a message-deleted event.
   */
  deleteMessage(conversationId: string, messageId: string, forEveryone: boolean): Promise<void>
  markRead(conversationId: string): Promise<void>
  updateSettings(conversationId: string, patch: Partial<ConversationSettings>): Promise<Conversation>
  deleteConversation(conversationId: string): Promise<void>
  subscribe(listener: (event: ChatEvent) => void): () => void
}
