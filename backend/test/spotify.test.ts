import assert from 'node:assert/strict'
import { test } from 'node:test'
import { playbackSignature, toPlayback, worthSending, type ApiPlayer, type Playback, type Sent } from '../src/features/spotify/playback.ts'

// What decides whether a tab hears from the server at all. A song that is merely playing has to send
// nothing — the tab advances the bar on its own clock — while anything the person would see as wrong
// has to go out at once. Getting this wrong is either a dead-feeling player or a month's bandwidth.

const DRIFT_MS = 1000

const player = (over: Partial<{ id: string; ms: number; playing: boolean; repeat: 'off' | 'context' | 'track' }> = {}): ApiPlayer => ({
  is_playing: over.playing ?? true,
  progress_ms: over.ms ?? 0,
  repeat_state: over.repeat ?? 'off',
  item: { id: over.id ?? 'pyramids', name: 'Pyramids', duration_ms: 600_000, type: 'track', artists: [{ name: 'Frank Ocean' }], album: { name: 'channel ORANGE', images: [{ url: 'art', width: 300 }] } },
})

const told = (p: Playback | null, at: number): Sent => ({ signature: playbackSignature(p), progressMs: p?.progressMs ?? 0, at })

test('a song simply playing is never sent again', () => {
  const start = toPlayback(player({ ms: 10_000 }))!
  const before = told(start, 0)
  // ten seconds later the song is ten seconds further on, exactly as the tab already believes
  const later = toPlayback(player({ ms: 20_000 }))!
  assert.equal(worthSending(before, later, 10_000, DRIFT_MS), false)
  // and five minutes later, still nothing to say
  assert.equal(worthSending(before, toPlayback(player({ ms: 310_000 }))!, 300_000, DRIFT_MS), false)
})

test('a tab that has been told nothing yet always hears', () => {
  assert.equal(worthSending(undefined, toPlayback(player()), 0, DRIFT_MS), true)
  assert.equal(worthSending(undefined, null, 0, DRIFT_MS), true)
})

test('the things a person would see as wrong all go out', () => {
  const playing = toPlayback(player({ ms: 10_000 }))!
  const before = told(playing, 0)

  // paused
  assert.equal(worthSending(before, toPlayback(player({ ms: 10_000, playing: false })), 0, DRIFT_MS), true)
  // a different song
  assert.equal(worthSending(before, toPlayback(player({ id: 'nights', ms: 0 })), 0, DRIFT_MS), true)
  // repeat switched
  assert.equal(worthSending(before, toPlayback(player({ ms: 10_000, repeat: 'track' })), 0, DRIFT_MS), true)
  // stopped altogether
  assert.equal(worthSending(before, null, 0, DRIFT_MS), true)
})

test('a seek is caught even though the song has not changed', () => {
  const before = told(toPlayback(player({ ms: 10_000 }))!, 0)
  // a second later they drag the bar to four minutes in: same track, same everything else
  const sought = toPlayback(player({ ms: 240_000 }))!
  assert.equal(playbackSignature(sought), before.signature, 'the signature alone would miss this')
  assert.equal(worthSending(before, sought, 1000, DRIFT_MS), true)
})

test('a track repeating itself is caught, where the signature alone would not be', () => {
  const before = told(toPlayback(player({ ms: 598_000, repeat: 'track' }))!, 0)
  // three seconds on it has looped back to the start rather than run to 601s
  const looped = toPlayback(player({ ms: 500, repeat: 'track' }))!
  assert.equal(worthSending(before, looped, 3000, DRIFT_MS), true)
})

test('a paused song that stays paused says nothing, and lyrics stay within the drift allowance', () => {
  const paused = toPlayback(player({ ms: 42_000, playing: false }))!
  const before = told(paused, 0)
  // a minute of being paused: the tab is still right, because it doesn't advance a paused bar
  assert.equal(worthSending(before, toPlayback(player({ ms: 42_000, playing: false })), 60_000, DRIFT_MS), false)

  // and while playing, a slip smaller than the allowance is tolerated, a larger one corrected —
  // this is the bound on how far time-synced lyrics can be out
  const playingBefore = told(toPlayback(player({ ms: 0 }))!, 0)
  assert.equal(worthSending(playingBefore, toPlayback(player({ ms: 30_900 })), 30_000, DRIFT_MS), false, '900ms out: left alone')
  assert.equal(worthSending(playingBefore, toPlayback(player({ ms: 31_600 })), 30_000, DRIFT_MS), true, '1.6s out: corrected')
})

test('an ad or a podcast reads as nothing playing rather than a track', () => {
  assert.equal(toPlayback(null), null)
  assert.equal(toPlayback({ ...player(), item: null }), null)
  assert.equal(toPlayback({ ...player(), item: { ...player().item!, type: 'episode' } }), null)
})
