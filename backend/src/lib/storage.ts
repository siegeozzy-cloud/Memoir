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
export function urlFor(key: string, folder: Folder) {
  if (!key.startsWith(CLOUD)) return `${config.API_URL ? config.apiOrigin : ''}/api/files/${folder}/${key}`
  return cloudinary.url(key.slice(CLOUD.length), { secure: true, resource_type: 'auto' })
}

export async function removeFile(key: string | null, folder: Folder) {
  if (!key) return
  if (!key.startsWith(CLOUD)) {
    await unlink(path.join(localDir(folder), path.basename(key))).catch(() => {})
    return
  }
  await cloudinary.uploader.destroy(key.slice(CLOUD.length), { invalidate: true }).catch(() => {})
}
