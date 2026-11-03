export type PhotoMeta = {
  gps?: { lat: number; lon: number }
  /** When the photo was taken (ISO), if the camera recorded it. */
  takenAt?: string
}

/**
 * Reads GPS position and capture time from a photo's EXIF (JPEG, PNG, HEIC/HEIF). Never throws.
 *
 * exifr is imported here rather than at the top of the file so it is a chunk of its own: nothing
 * reads EXIF until someone has picked a photo to post, and until then its ~40 KB would otherwise sit
 * in the bundle the sign-in screen has to parse. The await below is the first thing this already-async
 * function does, so callers are unaffected.
 */
export async function readPhotoMeta(file: File): Promise<PhotoMeta> {
  try {
    const { default: exifr } = await import('exifr')
    // exifr only works out latitude/longitude when the raw GPS tags are picked too
    const tags = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'GPSLatitude', 'GPSLatitudeRef', 'GPSLongitude', 'GPSLongitudeRef'],
    })
    if (!tags) return {}
    const lat = Number(tags.latitude), lon = Number(tags.longitude)
    const taken = tags.DateTimeOriginal ?? tags.CreateDate
    return {
      gps: Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0) ? { lat, lon } : undefined,
      takenAt: taken instanceof Date && !Number.isNaN(taken.getTime()) ? taken.toISOString() : undefined,
    }
  } catch {
    return {}
  }
}
