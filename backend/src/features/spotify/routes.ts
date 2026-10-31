import { eq } from 'drizzle-orm'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { config } from '../../config.ts'
import { db } from '../../db/client.ts'
import { spotifyLinks } from '../../db/schema.ts'
import { newToken } from '../../lib/crypto.ts'
import { parse } from '../../lib/errors.ts'
import { requireAuth, userOf } from '../../lib/session.ts'
import { linkAccount, SCOPES, spotifyApi } from './client.ts'

// Linking: GET /connect sends the browser to Spotify's consent page; Spotify sends it back to /callback,
// which stores the tokens and returns to the app with ?spotify=linked (or denied / error / unavailable).
// Playback: the web app's player calls /player and the control routes; the server adds the token.

const STATE_COOKIE = 'memoir_spotify_state'
const stateCookie = { httpOnly: true, sameSite: 'lax', secure: !config.dev, path: '/api/spotify', maxAge: 600 } as const

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

  /** Opened by the browser (a navigation, not fetch). */
  app.get('/connect', async (req, reply) => {
    if (!req.auth) return reply.redirect(config.appOrigin)
    if (!config.spotifyConfigured) return backToApp(reply, 'unavailable')
    const state = newToken()
    reply.setCookie(STATE_COOKIE, state, stateCookie)
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: config.SPOTIFY_CLIENT_ID!,
      scope: SCOPES.join(' '),
      redirect_uri: config.spotifyRedirectUri,
      state,
    })
    return reply.redirect(`https://accounts.spotify.com/authorize?${q}`)
  })

  app.get('/callback', async (req, reply) => {
    const { code, state, error } = req.query as Record<string, string | undefined>
    const expected = req.cookies[STATE_COOKIE]
    reply.clearCookie(STATE_COOKIE, stateCookie)
    if (!req.auth) return reply.redirect(config.appOrigin)
    if (error) return backToApp(reply, error === 'access_denied' ? 'denied' : 'error')
    // the state proves this redirect answers a link request this browser started
    if (!code || !state || !expected || state !== expected) return backToApp(reply, 'error')
    try {
      await linkAccount(userOf(req).id, code)
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

