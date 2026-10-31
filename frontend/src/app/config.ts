export const GLOBE_ROTATION = {
  enabled: true,
  /** Degrees of longitude per second. 2 = one full turn every 3 minutes. */
  degPerSec: 2,
  /** How long the globe waits after the user lets go before it starts spinning again. */
  resumeAfterMs: 5000,
}

/** How long a notification stays before it slides back up. */
export const NOTIFICATION_MS = 7000

/** Days a deleted post stays in Recently Deleted before it is removed for good. */
export const RECENTLY_DELETED_DAYS = 30

export const UPLOAD = {
  maxBytes: 50 * 1024 * 1024,
  maxFiles: 20,
  /** Matched by MIME type or, when the browser leaves that empty (common for HEIC), by extension. */
  types: ['image/jpeg', 'image/png', 'image/heic', 'image/heif'],
  extensions: ['jpg', 'jpeg', 'png', 'heic', 'heif'],
}
