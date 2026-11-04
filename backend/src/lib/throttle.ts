// Guessing, slowed down until it isn't worth it.
//
// A password can't defend itself against being tried over and over: given enough guesses, a weak one
// falls. The per-IP limit in app.ts caps how fast any single machine can ask, but that is the wrong
// shape of defence on its own — an attacker with a pool of addresses walks straight past it, while a
// shared office or campus address can be spent by people who simply mistyped. So wrong answers are
// also counted against the *account* being tried, and each failure past a small allowance locks that
// account's sign-in for longer than the last.
//
// Counted against the address as typed — emailSchema lowercases it, so capitals can't start a fresh
// count — and counted whether or not anyone has registered it. An address with no account has to
// behave exactly like one that is taken, or the lockout would answer the question the rest of
// sign-in is careful not to: is this person a member here?
//
// Held in memory, not in the database. A failed sign-in is something an attacker can ask for as fast
// as they like, and turning each one into a write would hand them a way to run up the bill on a
// database metered by the second. The cost is that a restart forgets the counts, which is a fair
// trade: an attacker can't cause a restart, and the per-IP limit still applies throughout.

type Attempts = { fails: number; until: number; touched: number }

/** Wrong answers allowed before the first lockout — enough room to genuinely misremember. */
const FREE = 5
/** What each failure past the allowance costs. The last value applies from then on. */
const LOCKOUTS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000]
/** A key that has been quiet this long starts again from nothing. */
const FORGET_AFTER = 2 * 60 * 60_000
/** A ceiling, so someone cycling addresses can't grow this until the process runs out of memory. */
const MAX_KEYS = 20_000

const seen = new Map<string, Attempts>()

/** This key's record, forgetting one that has been quiet long enough to deserve a clean slate. */
function current(key: string, now: number) {
  const a = seen.get(key)
  if (!a) return undefined
  if (a.until <= now && now - a.touched > FORGET_AFTER) {
    seen.delete(key)
    return undefined
  }
  return a
}

/** How much longer this key is locked out for, in ms. 0 means it may try now. */
export function lockedFor(key: string, now = Date.now()) {
  const a = current(key, now)
  return a && a.until > now ? a.until - now : 0
}

/**
 * Counts one wrong answer. Returns how long the key is locked out for as a result, or 0 while it is
 * still within the allowance.
 */
export function recordFailure(key: string, now = Date.now()) {
  const a = current(key, now) ?? { fails: 0, until: 0, touched: now }
  a.fails += 1
  a.touched = now
  const over = a.fails - FREE
  if (over > 0) a.until = now + LOCKOUTS[Math.min(over, LOCKOUTS.length) - 1]
  seen.set(key, a)
  prune(now)
  return a.until > now ? a.until - now : 0
}

/** Forgets this key. The password was right, so nobody is guessing it. */
export const clearFailures = (key: string) => void seen.delete(key)

/** "45 seconds", "5 minutes" — for the sentence the person reads. */
export function describeWait(ms: number) {
  const seconds = Math.ceil(ms / 1000)
  if (seconds <= 90) return `${seconds} second${seconds === 1 ? '' : 's'}`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

/**
 * Keeps the map bounded. Only runs when it is full, because the usual case is a handful of entries
 * and walking them on every wrong password would hand an attacker a way to make the server work.
 */
function prune(now: number) {
  if (seen.size <= MAX_KEYS) return
  for (const [key, a] of seen) if (a.until <= now && now - a.touched > FORGET_AFTER) seen.delete(key)
  if (seen.size <= MAX_KEYS) return
  // still full of live entries: drop the least recently touched, nearest to being forgotten anyway
  const oldestFirst = [...seen.entries()].sort((a, b) => a[1].touched - b[1].touched)
  for (const [key] of oldestFirst.slice(0, Math.ceil(MAX_KEYS / 4))) seen.delete(key)
}
