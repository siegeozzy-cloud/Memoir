// The sign-in token, for when the app and the API are on different addresses (memoir-album.vercel.app
// and the API's own host). Browsers won't carry the session cookie between two sites, so the app sends
// the token itself. When they do share an address — development, or a custom domain later — the cookie
// does the work and this is simply unused.
//
// "Keep me signed in" puts it in localStorage, which survives closing the browser; otherwise
// sessionStorage, which ends with the tab.

const KEY = 'memoir.token'

export const sessionToken = () => localStorage.getItem(KEY) ?? sessionStorage.getItem(KEY)

export function keepToken(token: string | undefined, remember: boolean) {
  clearToken()
  if (token) (remember ? localStorage : sessionStorage).setItem(KEY, token)
}

export function clearToken() {
  localStorage.removeItem(KEY)
  sessionStorage.removeItem(KEY)
}
