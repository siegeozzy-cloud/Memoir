import { useCallback, useEffect, useMemo, useState } from 'react'
import { me } from '../../mocks/people'
import type { User } from '../../shared/types'
import type { ChatService } from './service'
import type { Conversation, ConversationSettings, Message, MessageDraft } from './types'

const byActivity = (a: Conversation, b: Conversation) => b.lastActivityAt.localeCompare(a.lastActivityAt)

/** Chat state for the UI, kept in sync with a ChatService. */
export function useChat(service: ChatService) {
  const [users, setUsers] = useState<Record<string, User>>({ [me.id]: me })
  const [friendIds, setFriendIds] = useState<string[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Record<string, Message[]>>({})
  const [activeId, setActiveId] = useState<string | null>(null)

  const addUsers = useCallback((list: User[]) => {
    setUsers((u) => ({ ...u, ...Object.fromEntries(list.map((x) => [x.id, x])) }))
  }, [])

  const upsertConversation = useCallback((c: Conversation) => {
    setConversations((list) => [...list.filter((x) => x.id !== c.id), c].sort(byActivity))
  }, [])

  // initial load; opens the most recent conversation
  useEffect(() => {
    let cancelled = false
    Promise.all([service.listFriends(), service.listConversations()]).then(([friends, convs]) => {
      if (cancelled) return
      addUsers(friends)
      setFriendIds(friends.map((f) => f.id))
      const sorted = [...convs].sort(byActivity)
      setConversations(sorted)
      setActiveId((cur) => cur ?? sorted[0]?.id ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [service, addUsers])

  // pushed changes
  useEffect(
    () =>
      service.subscribe((e) => {
        if (e.type === 'conversation') upsertConversation(e.conversation)
        else if (e.type === 'conversation-deleted') {
          setConversations((list) => list.filter((c) => c.id !== e.conversationId))
          setMessages(({ [e.conversationId]: _gone, ...rest }) => rest)
          setActiveId((cur) => (cur === e.conversationId ? null : cur))
        } else if (e.type === 'message-deleted') {
          setMessages((m) => (m[e.conversationId] ? { ...m, [e.conversationId]: m[e.conversationId].filter((x) => x.id !== e.messageId) } : m))
        } else if (e.type === 'message') {
          setMessages((m) => (m[e.message.conversationId] ? { ...m, [e.message.conversationId]: [...m[e.message.conversationId], e.message] } : m))
        } else if (e.type === 'presence') addUsers([e.user])
      }),
    [service, upsertConversation, addUsers],
  )

  // load messages for the open conversation and mark it read
  useEffect(() => {
    if (!activeId) return
    let cancelled = false
    if (!messages[activeId]) {
      service.listMessages(activeId).then((list) => {
        if (!cancelled) setMessages((m) => ({ ...m, [activeId]: list }))
      })
    }
    service.markRead(activeId)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the conversation changes
  }, [activeId, service])

  const openWith = useCallback(
    async (user: User) => {
      addUsers([user])
      const c = await service.openConversationWith(user.id)
      upsertConversation(c)
      setActiveId(c.id)
    },
    [service, addUsers, upsertConversation],
  )

  const send = useCallback(
    async (draft: MessageDraft) => {
      const conversationId = activeId
      if (!conversationId || (!draft.text?.trim() && !draft.files?.length)) return
      // show it straight away; swap in the stored copy when the server answers
      const previews = (draft.files ?? []).map((f) => URL.createObjectURL(f))
      const temp: Message = {
        id: `tmp_${crypto.randomUUID()}`,
        conversationId,
        senderId: service.meId,
        createdAt: new Date().toISOString(),
        text: draft.text?.trim() || undefined,
        attachments: (draft.files ?? []).map((f, i) => ({
          id: `tmp_att_${i}`,
          kind: f.type.startsWith('video/') ? 'video' : 'image',
          url: previews[i],
          name: f.name,
        })),
        status: 'sending',
      }
      const put = (fn: (list: Message[]) => Message[]) => setMessages((m) => ({ ...m, [conversationId]: fn(m[conversationId] ?? []) }))
      put((list) => [...list, temp])
      try {
        const stored = await service.sendMessage(conversationId, draft)
        put((list) => list.map((x) => (x.id === temp.id ? stored : x)))
        previews.forEach((u) => URL.revokeObjectURL(u))
      } catch {
        put((list) => list.map((x) => (x.id === temp.id ? { ...x, status: 'failed' } : x)))
      }
    },
    [activeId, service],
  )

  /** Sends a copy to a friend, opening a conversation with them if there isn't one yet. */
  const forward = useCallback(
    async (message: Message, to: User) => {
      const c = await service.openConversationWith(to.id)
      upsertConversation(c)
      const stored = await service.forwardMessage(message.id, c.id)
      setMessages((m) => (m[c.id] ? { ...m, [c.id]: [...m[c.id], stored] } : m))
    },
    [service, upsertConversation],
  )

  /** Gone from the list at once; `forEveryone` unsends one of your own messages. */
  const deleteMessage = useCallback(
    async (message: Message, forEveryone: boolean) => {
      const { conversationId } = message
      setMessages((m) => (m[conversationId] ? { ...m, [conversationId]: m[conversationId].filter((x) => x.id !== message.id) } : m))
      await service.deleteMessage(conversationId, message.id, forEveryone)
    },
    [service],
  )

  const updateSettings = useCallback(
    async (patch: Partial<ConversationSettings>) => {
      if (!activeId) return
      upsertConversation(await service.updateSettings(activeId, patch))
    },
    [activeId, service, upsertConversation],
  )

  const remove = useCallback((conversationId: string) => service.deleteConversation(conversationId), [service])
  const search = useCallback((query: string) => service.searchUsers(query), [service])

  const active = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId])
  const other = active ? users[active.participantIds.find((id) => id !== service.meId) ?? ''] : undefined

  /** Friends for the people bar, most recent conversation first (reading one doesn't reorder the row). */
  const people = useMemo(() => {
    const convFor = (uid: string) => conversations.find((c) => c.participantIds.length === 2 && c.participantIds.includes(uid))
    return friendIds
      .map((id) => ({ user: users[id], conversation: convFor(id) }))
      .filter((p) => p.user)
      .sort((a, b) => (b.conversation?.lastActivityAt ?? '').localeCompare(a.conversation?.lastActivityAt ?? ''))
  }, [friendIds, users, conversations])

  return {
    meId: service.meId,
    users,
    people,
    conversations,
    active,
    other,
    messages: activeId ? messages[activeId] : undefined,
    open: setActiveId,
    openWith,
    search,
    send,
    forward,
    deleteMessage,
    updateSettings,
    remove,
  }
}

export type ChatApi = ReturnType<typeof useChat>
