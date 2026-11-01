import sharp from 'sharp'
import { HttpError } from '../../lib/errors.ts'
import { putFile, removeFile, urlFor } from '../../lib/storage.ts'

// Profile pictures: decoded, square-cropped to a 512px WebP, then handed to storage (a local folder in
// development, Cloudinary in production). Re-encoding drops whatever else was in the upload, including
// EXIF data such as the GPS location.

const SIZE = 512

export const avatarUrlFor = (file: string) => urlFor(file, 'avatars')

export async function saveAvatar(upload: Buffer) {
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
  return putFile('avatars', image, 'image', 'webp')
}

export const deleteAvatar = (file: string | null) => removeFile(file, 'avatars')
