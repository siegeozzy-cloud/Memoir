import { useEffect, useRef, useState } from 'react'
import { CHAT_UPLOAD } from '../../../app/config'
import type { MessageDraft } from '../types'
import { CloseIcon, PlayIcon, PlusCircleIcon, SendIcon } from './icons'

type Props = {
  placeholder: string
  onSend: (draft: MessageDraft) => void
}

type Picked = { file: File; url: string; kind: 'image' | 'video' }

const MAX_FILES = CHAT_UPLOAD.maxFiles
const MB = 1024 * 1024
const isMedia = (f: File) => f.type.startsWith('image/') || f.type.startsWith('video/')

export default function Composer({ placeholder, onSend }: Props) {
  const [text, setText] = useState('')
  const [picked, setPicked] = useState<Picked[]>([])
  const [problem, setProblem] = useState<string | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const filePicker = useRef<HTMLInputElement>(null)
  const canSend = text.trim().length > 0 || picked.length > 0

  // a rejected file explains itself, then gets out of the way
  useEffect(() => {
    if (!problem) return
    const t = setTimeout(() => setProblem(null), 6000)
    return () => clearTimeout(t)
  }, [problem])

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
    const chosen = [...files]
    const problems: string[] = []
    const ok: File[] = []
    for (const f of chosen) {
      if (!isMedia(f)) problems.push(`${f.name} isn’t a photo or a video.`)
      else if (f.size > CHAT_UPLOAD.maxBytes) problems.push(`${f.name} is ${Math.round(f.size / MB)} MB; the limit is ${CHAT_UPLOAD.maxBytes / MB} MB.`)
      else ok.push(f)
    }

    const space = MAX_FILES - pickedRef.current.length
    if (ok.length > space) problems.push(`A message carries up to ${MAX_FILES} files.`)
    setProblem(problems[0] ?? null)

    const fresh = ok.slice(0, Math.max(0, space)).map((file) => ({
      file,
      url: URL.createObjectURL(file),
      kind: file.type.startsWith('video/') ? ('video' as const) : ('image' as const),
    }))
    if (!fresh.length) return
    pickedRef.current = [...pickedRef.current, ...fresh] // so a second drop before re-render counts these
    setPicked((cur) => [...cur, ...fresh])
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
    pickedRef.current = []
    setPicked([])
    setText('')
    setProblem(null)
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
      {problem && (
        <p className="composer-problem" role="status">
          {problem}
        </p>
      )}
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
