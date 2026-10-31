import type { User } from '../shared/types'

// Placeholder data until the backend exists.

export const ME_ID = 'me'

export const me: User = { id: ME_ID, name: 'You', status: 'online' }

export const users: User[] = [
  { id: 'jack', name: 'Jack Musen', status: 'online', activity: { kind: 'spotify', artist: 'Arctic Monkeys', track: '505' } },
  { id: 'mara', name: 'Mara Lin', status: 'idle' },
  { id: 'lia', name: 'Lia Santos', status: 'online' },
  { id: 'theo', name: 'Theo Ramos', status: 'online', activity: { kind: 'spotify', artist: 'd4vd', track: 'Here With Me' } },
  { id: 'ken', name: 'Ken Adachi', status: 'dnd' },
  { id: 'ava', name: 'Ava Cruz', status: 'offline' },
  { id: 'noah', name: 'Noah Reyes', status: 'offline' },
  { id: 'iris', name: 'Iris Tan', status: 'idle' },
]

/** People you are not friends with yet; reachable through search. */
export const strangers: User[] = [
  { id: 'sam', name: 'Sam Ocampo', status: 'offline' },
  { id: 'dana', name: 'Dana Villanueva', status: 'online' },
]
