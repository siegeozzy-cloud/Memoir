import sharp from 'sharp'
import { HttpError } from './errors.ts'
import { putFile, removeFile, urlFor } from './storage.ts'

// Photos and videos sent in messages or posted as memories. Pictures are re-encoded, which drops
// everything else the file carried, including EXIF data such as the GPS location (the app reads that
// in the browser before uploading, when it needs it). Videos are checked and stored as they are.
// Where the bytes end up — a local folder or Cloudinary — is storage.ts's business.

const MAX_SIDE = 2048

/**
 * Everything is stored as JPEG. An iPhone's HEIC can't be shown by most Android and Windows
 * browsers, and WebP — what this used to write — still misses a long tail of older phones and
 * desktop apps. JPEG is the one format anything with a screen can open.
 *
 * mozjpeg buys back most of the size WebP was saving; progressive so a slow connection shows the
 * whole picture roughly before it shows any of it sharply.
 */
const JPEG = { quality: 82, mozjpeg: true, progressive: true } as const

export type StoredMedia = { kind: 'image' | 'video'; file: string; name: string; width?: number; height?: number }

export const mediaUrl = (file: string, kind: StoredMedia['kind'] = 'image') => urlFor(file, 'media', kind)

/** Videos are stored as sent, so only container types browsers can play are allowed. */
function videoExtension(data: Buffer) {
  if (data.length > 12 && data.toString('ascii', 4, 8) === 'ftyp') {
    const brand = data.toString('ascii', 8, 12)
    if (brand.startsWith('qt')) return 'mov'
    return 'mp4'
  }
  if (data.length > 4 && data.readUInt32BE(0) === 0x1a45dfa3) return 'webm'
  return null
}

export async function saveMedia(data: Buffer, originalName: string, mimetype: string): Promise<StoredMedia> {
  const name = (originalName.split(/[\\/]/).pop() ?? 'file').slice(0, 120) || 'file'

  if (mimetype.startsWith('video/')) {
    const ext = videoExtension(data)
    if (!ext) throw new HttpError(400, 'bad-video', 'That video isn’t one we can play. Try an MP4.', 'files')
    return { kind: 'video', file: await putFile('media', data, 'video', ext), name }
  }

  try {
    const image = sharp(data, { limitInputPixels: 100_000_000 }).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    const { data: out, info } = await image.flatten({ background: '#ffffff' }).jpeg(JPEG).toBuffer({ resolveWithObject: true })
    return { kind: 'image', file: await putFile('media', out, 'image', 'jpg'), name, width: info.width, height: info.height }
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw new HttpError(400, 'bad-image', 'That file isn’t a picture we can use. Try a JPEG, PNG or HEIC.', 'files')
  }
}

export async function deleteMedia(files: Iterable<string>) {
  for (const file of files) await removeFile(file, 'media')
}

export type Upload = { data: Buffer; filename: string; mimetype: string }

const MB = 1024 * 1024

/** The most one file may weigh, per place it can be sent from. The web app checks the same numbers. */
export const LIMITS = {
  /** A photo posted to the globe. Pictures are re-encoded here, so the stored copy is far smaller. */
  memory: 15 * MB,
  /** An attachment in a message, where videos are kept as they arrive. */
  chat: 25 * MB,
  avatar: 10 * MB,
} as const

/**
 * Reads a multipart request: text fields, and the files under `files`.
 * Rejects anything that isn't a picture or a video, or is over `maxBytes`, before it reaches storage.
 */
export async function readMultipart(
  req: { parts: (o?: object) => AsyncIterableIterator<Record<string, unknown>> },
  { maxFiles = 20, maxBytes = LIMITS.chat }: { maxFiles?: number; maxBytes?: number } = {},
) {
  const fields: Record<string, string> = {}
  const files: Upload[] = []
  for await (const part of req.parts({ limits: { files: maxFiles, fileSize: maxBytes } })) {
    if (part.type === 'file') {
      const mimetype = String(part.mimetype ?? '')
      const filename = String(part.filename ?? 'file')
      if (!/^(image|video)\//.test(mimetype)) throw new HttpError(400, 'bad-file', 'Only pictures and videos can be sent.', 'files')
      let data: Buffer
      try {
        data = await (part as { toBuffer(): Promise<Buffer> }).toBuffer()
      } catch (e) {
        // @fastify/multipart stops reading at the limit and throws; say which file and what the limit is
        if ((e as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
          throw new HttpError(413, 'too-large', `${filename} is over ${Math.round(maxBytes / MB)} MB, the most one file can be.`, 'files')
        }
        throw e
      }
      files.push({ data, filename, mimetype })
    } else {
      fields[String(part.fieldname)] = String(part.value)
    }
  }
  return { fields, files }
}

/** Parses a JSON field of a multipart form. */
export function jsonField(fields: Record<string, string>, name: string) {
  try {
    return fields[name] ? JSON.parse(fields[name]) : undefined
  } catch {
    throw new HttpError(400, 'invalid', 'That request wasn’t understood.')
  }
}
