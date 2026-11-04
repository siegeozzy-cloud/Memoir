import { eq } from 'drizzle-orm'
import { config } from '../../config.ts'
import { db } from '../../db/client.ts'
import { spotifyLinks } from '../../db/schema.ts'
import { decrypt, encrypt } from '../../lib/crypto.ts'
import { HttpError } from '../../lib/errors.ts'

// Spotify's Web API on behalf of a user. Tokens never leave the server: they're stored encrypted,
// refreshed here when they're about to expire, and the web app only sees the playback they unlock.

export const SCOPES = ['user-read-playback-state', 'user-read-currently-playing', 'user-modify-playback-state']

type TokenResponse = { access_token: string; refresh_token?: string; expires_in: number; scope: string }

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const basic = Buffer.from(`${config.SPOTIFY_CLIENT_ID}:${config.SPOTIFY_CLIENT_SECRET}`).toString('base64')
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  if (!r.ok) throw new HttpError(r.status === 400 ? 409 : 502, 'spotify-token', 'Spotify didn’t accept the sign-in. Link it again.')
  return (await r.json()) as TokenResponse
}

/** Finishes "Link Spotify": swaps the code from Spotify's redirect for tokens and stores them. */
export async function linkAccount(userId: string, code: string) {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: config.spotifyRedirectUri })
  const me = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${t.access_token}` } })
  if (!me.ok) throw new HttpError(502, 'spotify', 'Couldn’t read your Spotify profile.')
  const profile = (await me.json()) as { id: string; display_name?: string | null }
  const row = {
    spotifyUserId: profile.id,
    displayName: profile.display_name ?? null,
    accessToken: encrypt(t.access_token),
    refreshToken: encrypt(t.refresh_token ?? ''),
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    scope: t.scope,
    updatedAt: new Date(),
  }
  await db.insert(spotifyLinks).values({ userId, ...row }).onConflictDoUpdate({ target: spotifyLinks.userId, set: row })
}

const refreshing = new Map<string, Promise<string>>()

/** Thrown when the link has to be forgotten: the app answers it by offering to link again. */
const unlinked = (message: string) => new HttpError(409, 'spotify-unlinked', message)

/**
 * Reads a stored token, treating one that can't be read as a link that is no longer there.
 *
 * Tokens are sealed with TOKEN_KEY, so generating a new one — or restoring a database into an
 * environment with a different one — leaves rows that no longer open. `decrypt` throws a plain
 * error for that, which used to reach the browser as "Something went wrong on our side" on every
 * button, with nothing the person could do about it. Forgetting the link instead turns it into
 * "link it again", which is both true and fixable.
 */
async function readToken(sealed: string, userId: string) {
  try {
    return decrypt(sealed)
  } catch {
    // awaited, so by the time the browser is told to link again the dead row is already gone and
    // /status agrees with the answer it just got
    await db.delete(spotifyLinks).where(eq(spotifyLinks.userId, userId))
    throw unlinked('Spotify needs linking again.')
  }
}

/** A valid access token for this user, refreshed when it's within a minute of expiring. */
async function accessToken(userId: string, force = false): Promise<string> {
  const link = await db.query.spotifyLinks.findFirst({ where: eq(spotifyLinks.userId, userId) })
  if (!link) throw unlinked('Link Spotify in your profile first.')
  if (!force && link.expiresAt.getTime() - Date.now() > 60_000) return await readToken(link.accessToken, userId)
  // one refresh per user at a time, however many requests arrive together
  let pending = refreshing.get(userId)
  if (!pending) {
    pending = (async () => {
      try {
        const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: await readToken(link.refreshToken, userId) })
        await db
          .update(spotifyLinks)
          .set({
            accessToken: encrypt(t.access_token),
            ...(t.refresh_token ? { refreshToken: encrypt(t.refresh_token) } : {}),
            expiresAt: new Date(Date.now() + t.expires_in * 1000),
            updatedAt: new Date(),
          })
          .where(eq(spotifyLinks.userId, userId))
        return t.access_token
      } catch (e) {
        // the person revoked Memoir's access in their Spotify settings: forget the link
        await db.delete(spotifyLinks).where(eq(spotifyLinks.userId, userId))
        throw e instanceof HttpError ? new HttpError(409, 'spotify-unlinked', 'Spotify was disconnected. Link it again in your profile.') : e
      } finally {
        refreshing.delete(userId)
      }
    })()
    refreshing.set(userId, pending)
  }
  return pending
}

/** Calls the Web API as the user. Returns null for "204 No Content" (e.g. nothing playing). */
export async function spotifyApi(userId: string, path: string, init: RequestInit = {}, retried = false): Promise<unknown> {
  const token = await accessToken(userId, retried)
  const r = await fetch(`https://api.spotify.com/v1${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } })
  if (r.status === 401 && !retried) return spotifyApi(userId, path, init, true)
  if (r.status === 204 || r.status === 202) return null
  if (r.status === 403) throw new HttpError(403, 'premium-required', 'Spotify Premium is needed to control playback.')
  if (r.status === 404) throw new HttpError(409, 'no-device', 'Open Spotify on one of your devices first.')
  if (r.status === 429) throw new HttpError(429, 'rate-limited', 'Spotify is busy. Try again in a moment.')
  if (!r.ok) throw new HttpError(502, 'spotify', 'Spotify didn’t respond. Try again.')
  const text = await r.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    /**
     * A 2xx whose body isn't JSON. Spotify does this to the control endpoints — play, pause, next,
     * seek, repeat — which are documented as answering 204 but in practice sometimes come back 200
     * with a short body that isn't JSON at all.
     *
     * None of those callers read the body, so there is nothing to lose by treating it as no
     * content; it used to throw a bare SyntaxError, which reached the person as a 500 and
     * "Something went wrong on our side" on every press of every button. A read that does want the
     * body (the player) gets null, which the app already shows as nothing playing.
     */
    console.warn(`Spotify answered ${path} with ${r.status} and a body that isn't JSON: ${text.slice(0, 40)}`)
    return null
  }
}
