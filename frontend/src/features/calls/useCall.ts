import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../../shared/lib/api'
import { onChannel, sendSocket } from '../../shared/lib/socket'
import type { User } from '../../shared/types'

/**
 * Voice and video calls. The picture and sound go straight between the two devices (WebRTC);
 * the backend only passes the setup messages along and hands out the STUN and TURN addresses.
 * STUN finds a direct path; TURN relays the call when a network won't allow one.
 */

export type CallKind = 'voice' | 'video'
export type CallPhase = 'idle' | 'ringing-out' | 'ringing-in' | 'connecting' | 'in-call'

export type Call = { phase: CallPhase; callId: string; kind: CallKind; who: User; since?: number }

/** What the two devices send each other to set the call up: the offer/answer, then network routes. */
type Signal = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }

const FAILURES: Record<string, string> = {
  busy: 'You’re already on a call.',
  'their-line-busy': 'They’re on another call.',
  offline: 'They’re not online right now.',
  'do-not-disturb': 'They’ve asked not to be disturbed.',
  'not-friends': 'Add them as a friend first.',
}
const ENDINGS: Record<string, string> = {
  declined: 'Call declined.',
  'no-answer': 'No answer.',
  ended: 'Call ended.',
}

export function useCall(signedIn: boolean) {
  const [call, setCall] = useState<Call | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)

  const pc = useRef<RTCPeerConnection | null>(null)
  /** Set as soon as a call starts: the offer can arrive while the camera is still opening. */
  const ready = useRef<Promise<RTCPeerConnection | null> | null>(null)
  const local = useRef<MediaStream | null>(null)
  const pending = useRef<RTCIceCandidateInit[]>([]) // candidates that arrived before the description
  // the latest call, for the socket handlers and the controls (which run outside rendering)
  const callRef = useRef<Call | null>(null)
  useEffect(() => {
    callRef.current = call
  }, [call])

  const cleanUp = useCallback((message?: string) => {
    pc.current?.close()
    pc.current = null
    ready.current = null
    local.current?.getTracks().forEach((t) => t.stop())
    local.current = null
    pending.current = []
    setLocalStream(null)
    setRemoteStream(null)
    setMuted(false)
    setCameraOff(false)
    setCall(null)
    if (message) setNotice(message)
  }, [])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])

  /** Sets up the peer connection and the camera/microphone, then offers if we're the one calling. */
  const begin = useCallback((callId: string, kind: CallKind, offering: boolean) => {
    // kept as a promise so signals that arrive first can wait for it
    ready.current = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === 'video' })
        local.current = stream
        setLocalStream(stream)

        const { iceServers } = await api<{ iceServers: RTCIceServer[] }>('/calls/ice')
        const connection = new RTCPeerConnection({ iceServers })
        pc.current = connection
        for (const track of stream.getTracks()) connection.addTrack(track, stream)

        connection.ontrack = (e) => setRemoteStream(e.streams[0])
        connection.onicecandidate = (e) => {
          if (e.candidate) sendSocket({ type: 'call:signal', callId, data: { candidate: e.candidate.toJSON() } })
        }
        connection.onconnectionstatechange = () => {
          const state = connection.connectionState
          if (state === 'connected') setCall((c) => (c ? { ...c, phase: 'in-call', since: c.since ?? Date.now() } : c))
          else if (state === 'failed') {
            sendSocket({ type: 'call:end', callId })
            cleanUp('The call dropped. Try again.')
          }
        }

        if (offering) {
          const offer = await connection.createOffer()
          await connection.setLocalDescription(offer)
          sendSocket({ type: 'call:signal', callId, data: { description: offer } })
        }
        return connection
      } catch (e) {
        sendSocket({ type: 'call:end', callId })
        const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'NotFoundError')
        cleanUp(denied ? `Memoir needs permission to use your ${kind === 'video' ? 'camera and microphone' : 'microphone'}.` : 'Couldn’t start the call.')
        return null
      }
    })()
    return ready.current
  }, [cleanUp])

  // everything the backend passes along: who's calling, who picked up, and the connection details
  useEffect(() => {
    if (!signedIn) return
    return onChannel('call', (push) => {
      const { type, callId } = push as unknown as { type: string; callId?: string }
      const current = callRef.current

      if (type === 'call:incoming') {
        if (current) return sendSocket({ type: 'call:decline', callId })
        const { kind, from } = push as unknown as { kind: CallKind; from: User }
        setCall({ phase: 'ringing-in', callId: callId!, kind, who: from })
      } else if (type === 'call:ringing') {
        const { kind, with: who } = push as unknown as { kind: CallKind; with: User }
        setCall({ phase: 'ringing-out', callId: callId!, kind, who })
      } else if (type === 'call:accepted' && current && current.callId === callId) {
        setCall({ ...current, phase: 'connecting' })
        void begin(current.callId, current.kind, true)
      } else if (type === 'call:signal' && current && current.callId === callId) {
        void handleSignal((push as unknown as { data: Signal }).data, current.callId)
      } else if (type === 'call:ended' && current?.callId === callId) {
        cleanUp(ENDINGS[(push as { reason?: string }).reason ?? 'ended'] ?? 'Call ended.')
      } else if (type === 'call:failed') {
        cleanUp(FAILURES[(push as { reason?: string }).reason ?? ''] ?? 'Couldn’t start the call.')
      }

      async function handleSignal(data: Signal, id: string) {
        if (data.candidate) {
          const open = pc.current
          if (open?.remoteDescription) await open.addIceCandidate(data.candidate).catch(() => {})
          else pending.current.push(data.candidate)
          return
        }
        // the offer may land while the camera is still opening, so wait for the connection
        const connection = await ready.current
        if (!data.description || !connection) return
        await connection.setRemoteDescription(data.description)
        for (const c of pending.current.splice(0)) await connection.addIceCandidate(c).catch(() => {})
        if (data.description.type === 'offer') {
          const answer = await connection.createAnswer()
          await connection.setLocalDescription(answer)
          sendSocket({ type: 'call:signal', callId: id, data: { description: answer } })
        }
      }
    })
  }, [signedIn, begin, cleanUp])

  const start = useCallback(
    (who: User, kind: CallKind) => {
      if (callRef.current) return
      setNotice(null)
      sendSocket({ type: 'call:invite', to: who.id, kind })
    },
    [],
  )

  const accept = useCallback(() => {
    const current = callRef.current
    if (current?.phase !== 'ringing-in') return
    setCall({ ...current, phase: 'connecting' })
    sendSocket({ type: 'call:accept', callId: current.callId })
    // the caller sends the offer once we've picked up; the connection is set up ready for it
    void begin(current.callId, current.kind, false)
  }, [begin])

  const hangUp = useCallback(() => {
    const current = callRef.current
    if (!current) return
    sendSocket({ type: current.phase === 'ringing-in' ? 'call:decline' : 'call:end', callId: current.callId })
    cleanUp()
  }, [cleanUp])

  const toggleMute = useCallback(() => {
    const track = local.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMuted(!track.enabled)
  }, [])

  const toggleCamera = useCallback(() => {
    const track = local.current?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setCameraOff(!track.enabled)
  }, [])

  useEffect(() => () => cleanUp(), [cleanUp])

  return { call, notice, localStream, remoteStream, muted, cameraOff, start, accept, hangUp, toggleMute, toggleCamera }
}

export type CallApi = ReturnType<typeof useCall>
