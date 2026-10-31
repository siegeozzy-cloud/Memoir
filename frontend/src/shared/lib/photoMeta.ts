import exifr from 'exifr'

export type PhotoMeta = {
  gps?: { lat: number; lon: number }
  /** When the photo was taken (ISO), if the camera recorded it. */
  takenAt?: string
}

/** Reads GPS position and capture time from a photo's EXIF (JPEG, PNG, HEIC/HEIF). Never throws. */
export async function readPhotoMeta(file: File): Promise<PhotoMeta> {
  try {
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
