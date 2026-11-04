import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { v2 as cloudinary } from 'cloudinary'
import { config } from '../config.ts'
import { newToken } from './crypto.ts'

/**
 * Where uploaded files live. Two places, one set of functions:
 *
 * - **Cloudinary** once CLOUDINARY_URL is set (production). It serves the files from its own network and
 *   can shrink them on the way out, so a phone asks for a smaller copy of the same photo.
 * - **A local folder** otherwise (development), served from /api/files.
 *
 * What the database stores is a *key*: either a Cloudinary id or a file name. `urlFor` turns it back
 * into an address, so switching storage later doesn't need the rows changed.
 */

type Kind = 'image' | 'video'
export type Folder = 'avatars' | 'media'

/**
 * How big a copy to ask Cloudinary for.
 *
 * - `full` — what was stored (2048px for a photo, 512 for an avatar), modernised on the way out.
 * - `thumb` — for a grid tile or a filmstrip frame, where the full picture is a waste of a download.
 *
 * Both are only ever *smaller* than the stored file, never bigger, and neither crops.
 */
export type Variant = 'full' | 'thumb'

/**
 * What goes in the delivery URL.
 *
 * `f_auto` lets Cloudinary send AVIF or WebP to a browser that takes it and JPEG to one that
 * doesn't, which is roughly a third off for no visible difference; `q_auto` picks the quality per
 * picture rather than using one number for all of them. `c_limit` shrinks to fit inside the box and
 * leaves anything already smaller alone, so nothing is ever scaled up or cut off — the tiles are
 * square only because CSS crops them, and cropping here would change what they show.
 *
 * Why this is worth the lines: without it every grid of thumbnails downloaded full 2048px photos.
 * Cloudinary's free plan counts delivery and storage against one monthly pool of credits, and the
 * grids were the whole pool. A derived copy is built once, on the first request for it, and served
 * from cache after that — at 1,000 transformations to the credit, the copies cost close to nothing
 * next to the bytes they save. See docs/deploy.md, "Staying inside the free limits".
 */
const TRANSFORM: Record<Variant, Record<string, string | number>> = {
  full: { fetch_format: 'auto', quality: 'auto' },
  /**
   * 600px, which is wider than any of the places this is used — the widest is a picture in a chat
   * bubble, capped at 300px by CSS — so it stays sharp on a high-density screen at twice that, and
   * is oversampled on the small tiles. One size for all of them on purpose: a second, smaller one
   * would save more on a long grid of 100px cells, and is the next easy saving if delivery ever
   * gets tight, but it buys that at the price of another variant to keep straight everywhere.
   */
  thumb: { width: 600, crop: 'limit', fetch_format: 'auto', quality: 'auto' },
}

if (config.cloudinary) cloudinary.config({ secure: true }) // reads CLOUDINARY_URL

const localDir = (folder: Folder) => path.resolve(config.UPLOAD_DIR, folder)
const cloudFolder = (folder: Folder) => `${config.CLOUDINARY_FOLDER}/${folder}`

/** Cloudinary keys are marked so a key from either store can be told apart later. */
const CLOUD = 'cl:'

export async function putFile(folder: Folder, data: Buffer, kind: Kind, extension: string) {
  if (!config.cloudinary) {
    const file = `${Date.now().toString(36)}-${newToken().slice(0, 16)}.${extension}`
    await mkdir(localDir(folder), { recursive: true })
    await writeFile(path.join(localDir(folder), file), data)
    return file
  }
  const uploaded = await new Promise<{ public_id: string }>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: cloudFolder(folder),
          resource_type: kind === 'video' ? 'video' : 'image',
          // the file is already shrunk and stripped of its hidden data before it gets here
          unique_filename: true,
          overwrite: false,
        },
        (error, result) => (result ? resolve(result) : reject(error ?? new Error('Cloudinary upload failed'))),
      )
      .end(data)
  })
  return CLOUD + uploaded.public_id
}

/**
 * The address the app should load this file from. Local files are given the API's full address when the
 * app lives somewhere else, since a relative one would point at the app and find nothing.
 */
export function urlFor(key: string, folder: Folder, kind: Kind = 'image', variant: Variant = 'full') {
  // A local folder has nothing to resize with, so every variant is the one stored file. Development
  // therefore shows full-size pictures in the grids; only the bytes differ, never the layout.
  if (!key.startsWith(CLOUD)) return `${config.API_URL ? config.apiOrigin : ''}/api/files/${folder}/${key}`
  // Cloudinary delivers from /image/, /video/ or /raw/ — "auto" is an *upload* setting, and a URL
  // built with it 404s. The kind comes from the row the key was read from, so files already stored
  // are addressed correctly too.
  return cloudinary.url(key.slice(CLOUD.length), {
    secure: true,
    resource_type: kind,
    // a video is handed over as it was sent: re-encoding one costs far more than an image, and the
    // app only ever asks a video for its metadata until somebody presses play
    ...(kind === 'video' ? {} : TRANSFORM[variant]),
  })
}

export async function removeFile(key: string | null, folder: Folder) {
  if (!key) return
  if (!key.startsWith(CLOUD)) {
    await unlink(path.join(localDir(folder), path.basename(key))).catch(() => {})
    return
  }
  await cloudinary.uploader.destroy(key.slice(CLOUD.length), { invalidate: true }).catch(() => {})
}
