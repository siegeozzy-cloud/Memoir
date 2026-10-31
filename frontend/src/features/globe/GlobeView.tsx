import { useCallback, useEffect, useRef, useState } from 'react'
import type { Memory } from '../../shared/types'

export type GlobeFocus = { lat: number; lon: number; range?: number; /** change to fly again to the same place */ nonce: number }
/** Sign-in porthole framing: the globe's centre at (cx, cy) px with a radius of r px, looking down at lat/lon. */
export type GlobeIntro = { cx: number; cy: number; r: number; lat: number; lon: number }
export type GlobeShowcase = { lat: number; lon: number; image: string; /** Short place name beside the pin. */ label?: string }

type Props = {
  memories: Memory[]
  /** Show pins, place names and borders. Off gives the clean globe. */
  details: boolean
  rotation: { enabled: boolean; degPerSec: number; resumeAfterMs: number }
  /** Viewport y (px) where the free space for the globe ends; it rests just above this line. */
  stageBottom?: number
  /** Viewport x (px) covered by a panel on the left; the globe centres in the space to its right. */
  stageLeft?: number
  /** Show the globe's own buttons (sunlight). Off while a panel covers that corner. */
  controls?: boolean
  /** Fly the camera here. */
  focus?: GlobeFocus | null
  /** Stop rendering while something full-screen covers the globe. */
  paused?: boolean
  /** Placing a new post: clicking the map drops the pin (draftPin), which can then be dragged. */
  placing?: boolean
  draftPin?: { lat: number; lon: number } | null
  onPlace?: (at: { lat: number; lon: number }) => void
  onPinClick?: (memoryId: string) => void
  /** True while the light 2D map is showing instead of the dark globe. */
  onSurfaceChange?: (light: boolean) => void
  /** Sign-in screen framing; null eases back to the home layout. */
  intro?: GlobeIntro | null
  /** A decorative photo pin (sign-in screen); null makes it vanish. */
  showcase?: GlobeShowcase | null
}

// The globe is the standalone page in public/globe, run in a same-origin iframe.
// See the "Memoir bridge" section of public/globe/index.html for the message format.
export default function GlobeView({ memories, details, rotation, stageBottom, stageLeft = 0, controls = true, focus, paused = false, placing = false, draftPin = null, onPinClick, onSurfaceChange, onPlace, intro = null, showcase = null }: Props) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)
  const handlers = useRef({ onPinClick, onSurfaceChange, onPlace })
  const introPrimed = useRef(false)

  useEffect(() => {
    handlers.current = { onPinClick, onSurfaceChange, onPlace }
  }, [onPinClick, onSurfaceChange, onPlace])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.origin !== window.location.origin) return
      if (e.data?.type === 'memoir:ready') setLoaded(true)
      else if (e.data?.type === 'memoir:pin') handlers.current.onPinClick?.(e.data.id)
      else if (e.data?.type === 'memoir:surface') handlers.current.onSurfaceChange?.(!!e.data.light)
      else if (e.data?.type === 'memoir:place') handlers.current.onPlace?.({ lat: e.data.lat, lon: e.data.lon })
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const send = useCallback((config: Record<string, unknown>) => {
    frame.current?.contentWindow?.postMessage({ type: 'memoir:config', ...config }, window.location.origin)
  }, [])

  // one message per setting, so a resize doesn't rebuild the pins
  useEffect(() => {
    if (loaded) send({ pins: memories.map((m) => ({ id: m.id, lat: m.place.lat, lon: m.place.lon, label: `${m.title}, ${m.place.name}` })) })
  }, [loaded, send, memories])
  useEffect(() => {
    if (loaded) send({ details })
  }, [loaded, send, details])
  useEffect(() => {
    if (loaded) send({ rotation })
  }, [loaded, send, rotation])
  useEffect(() => {
    if (loaded && stageBottom !== undefined) send({ stage: { bottom: stageBottom } })
  }, [loaded, send, stageBottom])
  useEffect(() => {
    if (loaded) send({ stage: { left: stageLeft } })
  }, [loaded, send, stageLeft])
  useEffect(() => {
    if (loaded) send({ controls })
  }, [loaded, send, controls])
  useEffect(() => {
    if (loaded) send({ paused })
  }, [loaded, send, paused])
  useEffect(() => {
    if (loaded) send({ placing })
  }, [loaded, send, placing])
  useEffect(() => {
    if (loaded && placing) send({ draft: draftPin })
  }, [loaded, send, placing, draftPin])
  useEffect(() => {
    if (loaded && focus) send({ focus: { lat: focus.lat, lon: focus.lon, range: focus.range } })
  }, [loaded, send, focus])
  useEffect(() => {
    if (!loaded) return
    // the framing sent right after the globe loads applies at once; later changes fly there
    send({ intro: intro && { ...intro, jump: !introPrimed.current } })
    introPrimed.current = true
  }, [loaded, send, intro])
  useEffect(() => {
    if (loaded) send({ showcase })
  }, [loaded, send, showcase])

  return (
    <iframe
      ref={frame}
      className="globe"
      src={`${import.meta.env.BASE_URL}globe/index.html`}
      title="Globe of memories"
      onLoad={() => setLoaded(true)}
    />
  )
}
