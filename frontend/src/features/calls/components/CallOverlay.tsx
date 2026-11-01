import { useEffect, useRef, useState } from 'react'
import Avatar from '../../../shared/components/Avatar'
import type { CallApi } from '../useCall'
import { CameraOffIcon, HangUpIcon, MicOffIcon, MicOnIcon, PhoneUpIcon, VideoOnIcon } from './icons'
import './calls.css'

// Over everything while a call is coming in, ringing or connected.

export default function CallOverlay({ call: api }: { call: CallApi }) {
  const { call, localStream, remoteStream, muted, cameraOff } = api
  if (!call) return null
  const video = call.kind === 'video'
  const live = call.phase === 'in-call' || call.phase === 'connecting'

  return (
    <div className={`call${live ? ' is-live' : ''}`} role="dialog" aria-modal="true" aria-label={`${video ? 'Video' : 'Voice'} call with ${call.who.name}`}>
      <div className="call-card">
        {live && video ? (
          <div className="call-stage">
            <Video stream={remoteStream} className="call-remote" />
            {!remoteStream && (
              <div className="call-waiting">
                <Avatar user={call.who} size={96} radius={48} />
                <p>Connecting…</p>
              </div>
            )}
            <Video stream={localStream} muted className={`call-local${cameraOff ? ' is-off' : ''}`} />
          </div>
        ) : (
          <div className="call-who">
            <Avatar user={call.who} size={112} radius={56} />
            <h2>{call.who.name}</h2>
            <p>
              {call.phase === 'ringing-in'
                ? `Incoming ${video ? 'video' : 'voice'} call`
                : call.phase === 'ringing-out'
                  ? 'Ringing…'
                  : call.phase === 'connecting'
                    ? 'Connecting…'
                    : 'On a call'}
            </p>
            {call.phase === 'in-call' && <Timer since={call.since} />}
          </div>
        )}

        {live && video && (
          <div className="call-banner">
            <span>{call.who.name}</span>
            {call.phase === 'in-call' && <Timer since={call.since} />}
          </div>
        )}

        {/* the other side's sound, playing even when there's no video to show */}
        {live && !video && <Video stream={remoteStream} audioOnly />}

        <div className="call-controls">
          {call.phase === 'ringing-in' ? (
            <>
              <button type="button" className="call-btn is-hangup" aria-label="Decline" onClick={api.hangUp}>
                <HangUpIcon />
              </button>
              <button type="button" className="call-btn is-accept" aria-label="Accept" onClick={api.accept}>
                <PhoneUpIcon />
              </button>
            </>
          ) : (
            <>
              <button type="button" className={`call-btn${muted ? ' is-on' : ''}`} aria-pressed={muted} aria-label={muted ? 'Unmute' : 'Mute'} onClick={api.toggleMute}>
                {muted ? <MicOffIcon /> : <MicOnIcon />}
              </button>
              {video && (
                <button type="button" className={`call-btn${cameraOff ? ' is-on' : ''}`} aria-pressed={cameraOff} aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'} onClick={api.toggleCamera}>
                  {cameraOff ? <CameraOffIcon /> : <VideoOnIcon />}
                </button>
              )}
              <button type="button" className="call-btn is-hangup" aria-label="Hang up" onClick={api.hangUp}>
                <HangUpIcon />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Video({ stream, muted, className, audioOnly }: { stream: MediaStream | null; muted?: boolean; className?: string; audioOnly?: boolean }) {
  const el = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (el.current && el.current.srcObject !== stream) el.current.srcObject = stream
  }, [stream])
  if (!stream && !audioOnly) return null
  return <video ref={el} className={className} autoPlay playsInline muted={muted} hidden={audioOnly} />
}

function Timer({ since }: { since?: number }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    if (!since) return
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - since) / 1000)))
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [since])
  return (
    <span className="call-timer">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  )
}
