import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { config } from '../../config.ts'
import { newToken } from '../../lib/crypto.ts'
import { HttpError } from '../../lib/errors.ts'

// Profile pictures: decoded, square-cropped to 512px WebP and saved under UPLOAD_DIR/avatars with a random
// name. Re-encoding drops whatever else was in the upload, including EXIF data such as GPS location.

const dir = path.resolve(config.UPLOAD_DIR, 'avatars')
const SIZE = 512

export async function saveAvatar(userId: string, upload: Buffer) {
  let image: Buffer
  try {
    image = await sharp(upload, { limitInputPixels: 50_000_000 })
      .rotate() // honour the phone's orientation before the metadata is dropped
      .resize(SIZE, SIZE, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer()
  } catch {
    throw new HttpError(400, 'bad-image', 'That file isn’t a picture we can use. Try a JPEG, PNG or WebP.', 'avatar')
  }
  await mkdir(dir, { recursive: true })
  const file = `${userId}-${newToken().slice(0, 12)}.webp`
  await writeFile(path.join(dir, file), image)
  return file
}

export async function deleteAvatar(file: string | null) {
  if (!file) return
  await unlink(path.join(dir, path.basename(file))).catch(() => {})
}
