import { useEffect, useRef, useState } from 'react'
import type { MessageDraft } from '../types'
import { CloseIcon, PlayIcon, PlusCircleIcon, SendIcon } from './icons'

type Props = {
  placeholder: string
  onSend: (draft: MessageDraft) => void
}

type Picked = { file: File; url: string; kind: 'image' | 'video' }

const MAX_FILES = 10
const isMedia = (f: File) => f.type.startsWith('image/') || f.type.startsWith('video/')

export default function Composer({ placeholder, onSend }: Props) {
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<Picked[]>([])
  const input = useRef<HTMLTextAreaElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const canSend = text.trim().length > 0 || picked.length > 0

  // release preview URLs when they leave the tray or the composer unmounts
  const pickedRef = useRef(picked)
  useEffect(() => {
    pickedRef.current = picked
  }, [picked])
  useEffect(() => () => pickedRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  // grow with the text, up to about five lines
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [text])

  const add = (files: Iterable<File>) => {
    const media = [...files].filter(isMedia)
    if (!media.length) return
    setPicked((cur) => [
      ...cur,
      ...media.slice(0, MAX_FILES - cur.length).map((file) => ({
        file,
        url: URL.createObjectURL(file),
        kind: file.type.startsWith('video/') ? ('video' as const) : ('image' as const),
      })),
    ])
  }

  const removeAt = (i: number) =>
    setPicked((cur) => {
      URL.revokeObjectURL(cur[i].url)
      return cur.filter((_, j) => j !== i)
    })

  const send = () => {
    if (!canSend) return
    onSend({ text, files: picked.map((p) => p.file) })
    picked.forEach((p) => URL.revokeObjectURL(p.url))
    setPicked([])
    setText('')
    input.current?.focus()
  }

  return (
    <form
      className={`composer${picked.length ? ' has-media' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        send()
      }}
    >
      {picked.length > 0 && (
        <ul className="composer-tray" aria-label="Attachments">
          {picked.map((p, i) => (
            <li key={p.url}>
              {p.kind === 'video' ? (
                <>
                  <video src={p.url} muted preload="metadata" />
                  <span className="tray-play">
                    <PlayIcon size={22} />
                  </span>
                </>
              ) : (
                <img src={p.url} alt={p.file.name} />
              )}
              <button type="button" className="tray-remove" aria-label={`Remove ${p.file.name}`} onClick={() => removeAt(i)}>
                <CloseIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="composer-row">
        <button
          type="button"
          className="icon-btn composer-add"
          aria-label="Add photos or videos"
          title="Add photos or videos"
          disabled={picked.length >= MAX_FILES}
          onClick={() => filePicker.current?.click()}
        >
          <PlusCircleIcon />
        </button>
        <input
          ref={filePicker}
          type="file"
          accept="image/*,video/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) add(e.target.files)
            e.target.value = ''
          }}
        />
        <textarea
          ref={input}
          rows={1}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files].filter(isMedia)
            if (files.length) {
              e.preventDefault()
              add(files)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
        />
        <button type="submit" className="icon-btn composer-send" aria-label="Send" title="Send" disabled={!canSend}>
          <SendIcon />
        </button>
      </div>
    </form>
  )
}
