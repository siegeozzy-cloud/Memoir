import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { UPLOAD } from '../../../app/config'
import { readPhotoMeta, type PhotoMeta } from '../../../shared/lib/photoMeta'

type Picked = { id: string; file: File; url: string; meta?: PhotoMeta }

const ACCEPT = [...UPLOAD.types, ...UPLOAD.extensions.map((e) => `.${e}`)].join(',')
const MB = 1024 * 1024
const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
const accepted = (f: File) => UPLOAD.types.includes(f.type) || UPLOAD.extensions.includes(extOf(f.name))

/**
 * Photos chosen for upload: checks type and size, keeps preview URLs, and reads each photo's
 * GPS and capture time in the background. `existing` is how many photos the post already has
 * (Edit), so the total stays within UPLOAD.maxFiles.
 */
export function usePhotoPicker(existing = 0) {
  const [picked, setPicked] = useState<Picked[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const input = useRef<HTMLInputElement>(null)
  const existingRef = useRef(existing)
  useEffect(() => {
    existingRef.current = existing
  }, [existing])

  // release preview URLs on unmount
  const pickedRef = useRef(picked)
  useEffect(() => {
    pickedRef.current = picked
  }, [picked])
  useEffect(() => () => pickedRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  const add = (files: Iterable<File>) => {
    const problems: string[] = []
    const ok: File[] = []
    for (const f of files) {
      if (!accepted(f)) problems.push(`${f.name} isn’t a JPEG, PNG or HEIC photo.`)
      else if (f.size > UPLOAD.maxBytes) problems.push(`${f.name} is ${Math.round(f.size / MB)} MB; the limit is ${UPLOAD.maxBytes / MB} MB.`)
      else ok.push(f)
    }
    const space = UPLOAD.maxFiles - existingRef.current - pickedRef.current.length
    if (ok.length > space) problems.push(`A post holds up to ${UPLOAD.maxFiles} photos, so ${ok.length - space} ${ok.length - space === 1 ? 'was' : 'were'} left out.`)
    const fresh = ok.slice(0, Math.max(0, space)).map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))
    setErrors(problems)
    if (!fresh.length) return
    pickedRef.current = [...pickedRef.current, ...fresh] // so a second drop before re-render counts these
    setPicked((cur) => [...cur, ...fresh])
    for (const p of fresh) {
      readPhotoMeta(p.file).then((meta) => setPicked((cur) => cur.map((x) => (x.id === p.id ? { ...x, meta } : x))))
    }
  }

  const remove = (id: string) =>
    setPicked((cur) => {
      const gone = cur.find((p) => p.id === id)
      if (gone) URL.revokeObjectURL(gone.url)
      return cur.filter((p) => p.id !== id)
    })

  const clear = () => {
    pickedRef.current.forEach((p) => URL.revokeObjectURL(p.url))
    setPicked([])
    setErrors([])
  }

  // spread onto a hidden <input>; `browse` opens it
  const inputProps = {
    ref: input,
    type: 'file',
    accept: ACCEPT,
    multiple: true,
    hidden: true,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) add(e.target.files)
      e.target.value = ''
    },
  } as const

  return { picked, errors, add, remove, clear, browse: () => input.current?.click(), inputProps }
}

/** Drag-and-drop of files onto an element: spread `props` on it; `over` is true while files hover. */
export function useDrop(onFiles: (files: FileList) => void) {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files')
  return {
    over,
    props: {
      onDragEnter: (e: DragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth.current++
        setOver(true)
      },
      onDragOver: (e: DragEvent) => {
        if (hasFiles(e)) e.preventDefault()
      },
      onDragLeave: () => {
        depth.current = Math.max(0, depth.current - 1)
        if (!depth.current) setOver(false)
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        depth.current = 0
        setOver(false)
        onFiles(e.dataTransfer.files)
      },
    },
  }
}
