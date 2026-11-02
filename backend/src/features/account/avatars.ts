import sharp from 'sharp'
import { HttpError } from '../../lib/errors.ts'
import { putFile, removeFile, urlFor } from '../../lib/storage.ts'

// Profile pictures: decoded, square-cropped to a 512px JPEG, then handed to storage (a local folder in
// development, Cloudinary in production). Re-encoding drops whatever else was in the upload, including
// EXIF data such as the GPS location. JPEG for the same reason as the photos in lib/uploads.ts: it is
// the one format every device can show.

const SIZE = 512

export const avatarUrlFor = (file: string) => urlFor(file, 'avatars')

export async function saveAvatar(upload: Buffer) {
  let image: Buffer
  try {
    image = await sharp(upload, { limitInputPixels: 50_000_000 })
      .rotate() // honour the phone's orientation before the metadata is dropped
      .resize(SIZE, SIZE, { fit: 'cover' })
      // a PNG's see-through corners would otherwise come out black
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()
  } catch {
    throw new HttpError(400, 'bad-image', 'That file isn’t a picture we can use. Try a JPEG, PNG or WebP.', 'avatar')
  }
  return putFile('avatars', image, 'image', 'jpg')
}

export const deleteAvatar = (file: string | null) => removeFile(file, 'avatars')
