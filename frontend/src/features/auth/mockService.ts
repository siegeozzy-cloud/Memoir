import { me } from '../../mocks/people'
import type { AuthService, Session } from './service'

// Without the backend (VITE_API=mock): accepts any details and signs in as the mock "me" user.
// The mock profile (features/account) takes its first name from here.

const KEY = 'memoir.session'
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** "maria.santos@…" → "Maria Santos", a stand-in name until the profile has a real one */
const nameFromEmail = (email: string) =>
  email.split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || me.name

function save(session: Session, remember: boolean) {
  // "Keep me signed in" survives closing the browser; otherwise the session ends with the tab
  ;(remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(session))
}

function read(storage: Storage): Session | null {
  try {
    const raw = storage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export const mockAuthService: AuthService = {
  async restore() {
    return read(localStorage) ?? read(sessionStorage)
  },

  async signIn({ email, remember }) {
    await wait(700)
    const session: Session = { user: { ...me, name: nameFromEmail(email.trim()) }, email: email.trim() }
    save(session, remember)
    return session
  },

  async signUp({ name, email }) {
    await wait(900)
    const session: Session = { user: { ...me, name: name.trim() || nameFromEmail(email.trim()) }, email: email.trim() }
    save(session, false)
    return { status: 'signed-in', session }
  },

  async signOut() {
    localStorage.removeItem(KEY)
    sessionStorage.removeItem(KEY)
  },
}
