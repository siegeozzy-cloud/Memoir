import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto'
import { config } from '../config.ts'

/** A random secret for cookies and email links (256 bits, URL-safe). */
export const newToken = () => randomBytes(32).toString('base64url')

/** What's stored instead of the token itself, so a database leak doesn't hand out sessions. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** e.g. MMR-7K2Q-9XA4. No 0/O or 1/I, so it's easy to read out to a friend. */
export function newUniqueId() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const pick = () => Array.from({ length: 4 }, () => abc[randomInt(abc.length)]).join('')
  return `MMR-${pick()}-${pick()}`
}

// AES-256-GCM for secrets kept at rest (Spotify tokens): "v1.<iv>.<tag>.<ciphertext>", base64url.
export function encrypt(plain: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', config.tokenKey, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.')
}

export function decrypt(sealed: string) {
  const [v, iv, tag, data] = sealed.split('.')
  if (v !== 'v1') throw new Error('Unknown encryption format')
  const decipher = createDecipheriv('aes-256-gcm', config.tokenKey, Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}
