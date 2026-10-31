import { useEffect, useRef, useState } from 'react'
import { flagEmoji } from '../../../shared/lib/countries'
import { longDate } from '../../../shared/lib/time'
import type { Memory, User } from '../../../shared/types'
import { kindLabel } from '../labels'
import TaggedNames from './TaggedNames'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, GlobeIcon, PinIcon } from './icons'

type Props = {
  memory: Memory
  meId: string
  users: Record<string, User>
  onClose: () => void
  onLocate: (m: Memory) => void
  onOpenProfile?: (userId: string) => void
}

// Full-screen photo/album viewer. Arrow keys or the side buttons move through an album.
export default function PostViewer({ memory: m, meId, users, onClose, onLocate, onOpenProfile }: Props) {
  const [index, setIndex] = useState(0)
  const [broken, setBroken] = useState<Set<string>>(new Set())
  const closeBtn = useRef<HTMLButtonElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const n = m.items.length
  const item = m.items[Math.min(index, n - 1)]
  const go = (d: number) => setIndex((i) => (i + d + n) % n)

  useEffect(() => {
    closeBtn.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (n > 1 && e.key === 'ArrowLeft') go(-1)
      else if (n > 1 && e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    strip.current?.children[index]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [index])

  const owner = users[m.ownerId]

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={m.title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <header className="viewer-top">
        <div className="viewer-title">
          <h2>{m.title}</h2>
          <p>
            <PinIcon /> {m.place.name}, {m.place.country}
            {m.place.countryCode && <span aria-hidden="true"> {flagEmoji(m.place.countryCode)}</span>}
            <span className="dot">·</span>
            {longDate(m.capturedAt)}
            <span className="dot">·</span>
            {kindLabel(m)}
            {owner && owner.id !== meId && (
              <>
                <span className="dot">·</span>
                by{' '}
                <button type="button" className="tag-name" onClick={() => onOpenProfile?.(owner.id)}>
                  {owner.name}
                </button>
              </>
            )}
          </p>
        </div>
        <div className="viewer-actions">
          <button type="button" className="viewer-btn" onClick={() => onLocate(m)}>
            <GlobeIcon /> Show on globe
          </button>
          <button type="button" className="viewer-close" ref={closeBtn} onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
      </header>

      <div className="viewer-stage" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {n > 1 && (
          <button type="button" className="viewer-nav is-prev" onClick={() => go(-1)} aria-label="Previous photo">
            <ChevronLeftIcon size={26} />
          </button>
        )}
        {item &&
          (item.kind === 'video' ? (
            <video key={item.id} src={item.url} controls autoPlay playsInline className="viewer-media" />
          ) : broken.has(item.id) ? (
            <div className="viewer-media viewer-fallback">This photo can’t be shown in this browser yet (HEIC). It will once uploads are converted on the server.</div>
          ) : (
            <img key={item.id} src={item.url} alt={item.name ?? m.title} className="viewer-media" onError={() => setBroken((b) => new Set(b).add(item.id))} />
          ))}
        {n > 1 && (
          <button type="button" className="viewer-nav is-next" onClick={() => go(1)} aria-label="Next photo">
            <ChevronRightIcon size={26} />
          </button>
        )}
      </div>

      <footer className="viewer-bottom">
        {n > 1 && (
          <>
            <span className="viewer-count">
              {index + 1} / {n}
            </span>
            <div className="viewer-strip" ref={strip}>
              {m.items.map((it, i) => (
                <button key={it.id} type="button" aria-label={`Photo ${i + 1}`} aria-current={i === index || undefined} onClick={() => setIndex(i)}>
                  {it.kind === 'video' ? <video src={it.url} muted preload="metadata" /> : <img src={it.url} alt="" />}
                </button>
              ))}
            </div>
          </>
        )}
        <TaggedNames ids={m.taggedIds} users={users} onOpenProfile={onOpenProfile} max={6} />
      </footer>
    </div>
  )
}
