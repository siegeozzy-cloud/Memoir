import { funFacts } from './funFacts'

// Facts are dealt from a shuffled deck saved in localStorage, so every open shows a different
// fact and none repeats until the whole list has been seen.

const KEY = 'memoir.funFacts.deck'

type Deck = { remaining: number[]; last: number }

function shuffle(n: number, avoidFirst: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  // the first fact of a new round should not be the one just shown
  if (n > 1 && a[0] === avoidFirst) [a[0], a[1]] = [a[1], a[0]]
  return a
}

function load(): Deck | null {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Deck | null
    if (!d || !Array.isArray(d.remaining)) return null
    return { remaining: d.remaining.filter((i) => Number.isInteger(i) && i >= 0 && i < funFacts.length), last: d.last }
  } catch {
    return null
  }
}

let current: string | null = null

/** The fact for this app open. Stable for the lifetime of the page. */
export function factOfThisOpen(): string {
  if (current !== null) return current
  const deck = load() ?? { remaining: [], last: -1 }
  if (!deck.remaining.length) deck.remaining = shuffle(funFacts.length, deck.last)
  const i = deck.remaining.shift()!
  try {
    localStorage.setItem(KEY, JSON.stringify({ remaining: deck.remaining, last: i }))
  } catch {
    // storage unavailable (private mode): still show a random fact
  }
  current = funFacts[i]
  return current
}
