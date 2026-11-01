import { apiUrl } from './api'
import { sessionToken } from './session-token'

// One WebSocket to the backend (/api/ws) for everything that arrives without being asked for:
// new messages, presence, friend requests, posts you're tagged in and call signalling.
// It reconnects on its own, so a dropped connection or a sleeping laptop recovers quietly.

export type Push = { channel: string; [key: string]: unknown }
type Listener = (push: Push) => void

const listeners = new Map<string, Set<Listener>>()
let socket: WebSocket | null = null
let wanted = false
let attempt = 0
let retry: ReturnType<typeof setTimeout> | undefined
const queue: string[] = []

const url = () => new URL(apiUrl('/ws'), location.href).href.replace(/^http/, 'ws')

/**
 * A browser can't set headers on a WebSocket, so when the session is a token rather than a cookie it
 * travels in the sub-protocol list, which the server reads and answers with 'memoir.v1'.
 */
const protocols = () => {
  const token = sessionToken()
  return token ? ['memoir.v1', `memoir.token.${token}`] : ['memoir.v1']
}

function open() {
  if (!wanted || socket) return
  const ws = new WebSocket(url(), protocols())
  socket = ws

  ws.onopen = () => {
    attempt = 0
    for (const msg of queue.splice(0)) ws.send(msg)
  }
  ws.onmessage = (e) => {
    let push: Push
    try {
      push = JSON.parse(e.data as string)
    } catch {
      return
    }
    for (const fn of listeners.get(push.channel) ?? []) fn(push)
  }
  ws.onclose = () => {
    socket = null
    if (!wanted) return
    // back off up to ~15s, so a backend restart doesn't get hammered
    const wait = Math.min(15_000, 500 * 2 ** attempt++) + Math.random() * 400
    retry = setTimeout(open, wait)
  }
  ws.onerror = () => ws.close()
}

export function openSocket() {
  wanted = true
  attempt = 0
  open()
}

export function closeSocket() {
  wanted = false
  clearTimeout(retry)
  queue.length = 0
  socket?.close()
  socket = null
}

/** Listens to one channel ('chat', 'memories', 'friends', 'call'). Returns a function that stops listening. */
export function onChannel(channel: string, fn: Listener) {
  const set = listeners.get(channel) ?? new Set()
  set.add(fn)
  listeners.set(channel, set)
  return () => {
    set.delete(fn)
  }
}

/** Sends a message up (call signalling). Held until the connection is back if it's down. */
export function sendSocket(msg: Record<string, unknown>) {
  const data = JSON.stringify(msg)
  if (socket?.readyState === WebSocket.OPEN) socket.send(data)
  else if (wanted && queue.length < 50) queue.push(data)
}
