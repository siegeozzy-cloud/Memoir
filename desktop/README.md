# Memoir for the desktop

A window onto the hosted web app, plus a tray icon so closing it doesn't sign you out or cut the
live connection. There is **no copy of the app in here** — it loads
[memoir-album.vercel.app](https://memoir-album.vercel.app), so shipping the web app ships this too,
and the two can never drift apart.

```sh
npm install
npm start           # build, then open it against the live site
npm run dev         # the same, against your local Vite server on :5173
npm run dist        # an unsigned installer for this platform, into release/
```

> **Run it in a real terminal, not VS Code's.** VS Code sets `ELECTRON_RUN_AS_NODE=1` in its
> integrated terminal, which turns the Electron binary into a plain Node and leaves you with
> `Cannot read properties of undefined (reading 'requestSingleInstanceLock')`. The app now says so
> rather than crashing, but the way past it is `env -u ELECTRON_RUN_AS_NODE npm start`.

## Why it loads the hosted app instead of bundling the built frontend

Bundling is the obvious idea and it costs more than it looks. The server has one `APP_URL`, and
everything that has to send a person *back* to the app points at it: the confirmation email
([`auth/routes.ts`](../backend/src/features/auth/routes.ts)), the password-reset link, and the
Spotify callback ([`spotify/routes.ts`](../backend/src/features/spotify/routes.ts)). A bundled app
served from a custom scheme has an origin the server has never heard of, so all three of those
journeys would finish in a browser window rather than in the app, and one server can't vary
`APP_URL` per client. There is also no CSP on a custom scheme unless the main process adds one, and
`file://` pages send `Origin: null`, which the API refuses by design.

None of that is unsolvable — it needs a validated `return_to` through the OAuth state, or a
registered deep link — but it is a backend change, and this version needs none at all. See
[docs/roadmap.md](../docs/roadmap.md).

**It costs no hosting either.** The desktop app is a binary people install; it talks to the same API
as the web app, so it adds no Render instance hours, only requests.

## What's in it

| | |
| --- | --- |
| [`src/main.ts`](src/main.ts) | the window, the tray, the menu, and the permission rules |
| [`src/origins.ts`](src/origins.ts) | where the window may go, and what it may ask the OS for |
| [`src/window-state.ts`](src/window-state.ts) | remembers where the window was |
| [`assets/offline.html`](assets/offline.html) | shown when the app can't be reached |

The renderer is a remote page, so it gets none of Electron: `nodeIntegration` off,
`contextIsolation` on, `sandbox` on, no preload. There is nothing to expose to it, which is why
there is no IPC anywhere in here.

**Navigation is the security boundary.** Only Memoir, its API and Spotify's consent pages may load
in this window; everything else — the terms and privacy links, anything somebody sends in a chat —
opens in the real browser. Spotify needs three origins for one click, because linking is a plain
navigation out to Spotify and back through the API; that round trip is why `API_URL` appears here.

**Permissions are narrowed, not widened.** Electron grants several by default; this grants the
camera and microphone (for calls) to Memoir alone, and refuses the rest without a prompt.

## If the API moves

Its address is written in four places now, and they all have to agree:

1. `VITE_API_URL` in Vercel's environment variables
2. `API_ORIGIN` in [`frontend/security-headers.ts`](../frontend/security-headers.ts)
3. the `Content-Security-Policy` in [`frontend/vercel.json`](../frontend/vercel.json)
4. `API_URL` in [`src/origins.ts`](src/origins.ts) — **this one**, or linking Spotify stops working

Both addresses can be overridden at runtime for testing, without a rebuild:

```sh
MEMOIR_APP_URL=http://127.0.0.1:5173 MEMOIR_API_URL=http://127.0.0.1:4000 npm start
```

## Not here yet

- **Desktop notifications.** The web app raises none — it has its own in-app notifications
  ([`useNotifications.ts`](../frontend/src/features/home/useNotifications.ts)) and never calls the
  `Notification` API. The permission is already granted here, so the day the web app starts raising
  them they will appear as system notifications with no change to this app. An unread badge on the
  dock or tray needs the web app to say how many there are, which it currently tells nobody.
- **Signing.** `npm run dist` produces an unsigned build: macOS will refuse to open it without a
  right-click → Open, and Windows will show a SmartScreen warning. Signing costs about $100/year
  per platform and is worth it only when other people install this.
- **Auto-update.** electron-builder supports it, but it needs somewhere to publish to. Since the
  app is a thin window, the web app updates itself on every reload anyway — only changes to this
  shell need a new download.

## The icons

`build/icon.png` (the installer and dock icon) and `assets/tray*.png` were generated from
[`frontend/src/assets/logo-black.svg`](../frontend/src/assets/logo-black.svg) — trimmed to the ink,
then placed on a light plate for the app icon and left black-on-transparent for the tray.
`trayTemplate.png` is named for macOS's convention: a template image is treated as a mask and
recoloured for a light or dark menu bar, so it must carry no colour of its own.
