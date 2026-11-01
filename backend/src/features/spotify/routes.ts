import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { config } from '../../config.ts'
import { db } from '../../db/client.ts'
import { spotifyLinks } from '../../db/schema.ts'
import { decrypt, encrypt } from '../../lib/crypto.ts'
import { parse } from '../../lib/errors.ts'
import { requireAuth, userOf } from '../../lib/session.ts'
import { linkAccount, SCOPES, spotifyApi } from './client.ts'

// Linking: GET /connect sends the browser to Spotify's consent page; Spotify sends it back to /callback,
// which stores the tokens and returns to the app with ?spotify=linked (or denied / error / unavailable).
// Playback: the web app's player calls /player and the control routes; the server adds the token.

/**
 * Starting the link is a plain browser navigation to Spotify, which can carry no header and (once the
 * app and the API are on different addresses) no cookie either. So who it's for travels in OAuth's own
 * `state`, encrypted with TOKEN_KEY: the callback can read it, and nobody else can forge it.
 */
const STATE_TTL = 10 * 60 * 1000

const makeState = (userId: string) => encrypt(JSON.stringify({ userId, until: Date.now() + STATE_TTL }))

function readState(state: string | undefined) {
  if (!state) return null
  try {
    const { userId, until } = JSON.parse(decrypt(state)) as { userId: string; until: number }
    return until > Date.now() ? userId : null
  } catch {
    return null // tampered with, or from an older TOKEN_KEY
  }
}

type ApiPlayer = {
  is_playing: boolean
  progress_ms: number | null
  repeat_state: 'off' | 'context' | 'track'
  item: {
    id: string
    name: string
    duration_ms: number
    type: string
    artists?: { name: string }[]
    album?: { name: string; images?: { url: string; width: number }[] }
  } | null
}

/** Matches the web app's `Playback`, minus `at` (the app stamps the time it received it). */
function toPlayback(p: ApiPlayer | null) {
  if (!p?.item || p.item.type !== 'track') return null // nothing playing, an ad, or a podcast
  const images = p.item.album?.images ?? []
  const art = images.find((i) => i.width <= 320) ?? images[images.length - 1]
  return {
    track: {
      id: p.item.id,
      title: p.item.name,
      artists: (p.item.artists ?? []).map((a) => a.name).join(', '),
      album: p.item.album?.name ?? '',
      artUrl: art?.url,
      durationMs: p.item.duration_ms,
    },
    isPlaying: p.is_playing,
    progressMs: p.progress_ms ?? 0,
    repeat: p.repeat_state,
  }
}

const Seek = z.object({ positionMs: z.number().int().min(0) })
const Repeat = z.object({ mode: z.enum(['off', 'context', 'track']) })

export default async function spotifyRoutes(app: FastifyInstance) {
  const backToApp = (reply: FastifyReply, result: string) => reply.redirect(`${config.appOrigin}/?spotify=${result}`)

  app.get('/status', { preHandler: requireAuth }, async (req) => {
    const link = await db.query.spotifyLinks.findFirst({ where: eq(spotifyLinks.userId, userOf(req).id) })
    return { configured: config.spotifyConfigured, linked: !!link, displayName: link?.displayName ?? null }
  })

  /** The app asks for this, then sends the browser to it. */
  app.get('/authorize-url', { preHandler: requireAuth }, async (req) => {
    if (!config.spotifyConfigured) return { url: null as string | null }
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: config.SPOTIFY_CLIENT_ID!,
      scope: SCOPES.join(' '),
      redirect_uri: config.spotifyRedirectUri,
      state: makeState(userOf(req).id),
    })
    return { url: `https://accounts.spotify.com/authorize?${q}` }
  })

  /** Where Spotify sends the browser back. No session here, so the state says who it was. */
  app.get('/callback', async (req, reply) => {
    const { code, state, error } = req.query as Record<string, string | undefined>
    const userId = readState(state)
    if (error) return backToApp(reply, error === 'access_denied' ? 'denied' : 'error')
    if (!code || !userId) return backToApp(reply, 'error')
    try {
      await linkAccount(userId, code)
    } catch (e) {
      req.log.warn(e, 'Spotify linking failed')
      return backToApp(reply, 'error')
    }
    return backToApp(reply, 'linked')
  })

  app.delete('/', { preHandler: requireAuth }, async (req, reply) => {
    await db.delete(spotifyLinks).where(eq(spotifyLinks.userId, userOf(req).id))
    return reply.code(204).send()
  })

  app.register(async (player) => {
    player.addHook('preHandler', requireAuth)
    const control = (method: string, path: string) => async (req: Parameters<typeof requireAuth>[0], reply: FastifyReply) => {
      await spotifyApi(userOf(req).id, path, { method })
      return reply.code(204).send()
    }

    player.get('/player', async (req) => ({ playback: toPlayback((await spotifyApi(userOf(req).id, '/me/player')) as ApiPlayer | null) }))
    player.put('/player/play', control('PUT', '/me/player/play'))
    player.put('/player/pause', control('PUT', '/me/player/pause'))
    player.post('/player/next', control('POST', '/me/player/next'))
    player.post('/player/previous', control('POST', '/me/player/previous'))
    player.put('/player/seek', async (req, reply) => {
      const { positionMs } = parse(Seek, req.body)
      return control('PUT', `/me/player/seek?position_ms=${positionMs}`)(req, reply)
    })
    player.put('/player/repeat', async (req, reply) => {
      const { mode } = parse(Repeat, req.body)
      return control('PUT', `/me/player/repeat?state=${mode}`)(req, reply)
    })
  })
}

