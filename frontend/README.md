# Memoir — frontend

React + Vite + TypeScript. See the [project README](../README.md) for the whole repository.

## Run it

```sh
cd frontend
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. (The dev server is pinned to that address for Spotify sign-in; see below.)

Everything talks to the backend ([../backend](../backend/README.md)), so start that first. In production
the API is somewhere else entirely: set `VITE_API_URL` (Vercel does this at build time) and the app signs
in with a token instead of a cookie, because browsers won't share a cookie between two different sites. Each feature has a
`service.ts` (what the app needs from the server); `httpService.ts` talks to the backend and `mockService.ts` stands in
without it. `src/app/services.ts` picks which one each feature uses, and `VITE_API=mock` in `.env.local` runs the app on
in-browser mock data (no friends, live updates or calls).

A WebSocket (`src/shared/lib/socket.ts`) carries everything that arrives without being asked for: new messages,
who's online and what they're playing, friend requests, posts you're tagged in, and call setup.

## Folders

```
src/
  app/          App shell: App.tsx (screens and the sign-in entrance), main.tsx, global CSS, config.ts
  features/     One folder per feature: its service + mock, hooks, and components/
    auth/       Sign in / sign up, the porthole screen
    account/    Profile: picture, name, status, notifications, unique ID, deactivate/delete
    chat/       Messages: conversations, hover actions, forwarding
    friends/    Finding people by name or unique ID, requests
    calls/      Voice and video calls (WebRTC)
    memories/   Posts and albums: Logged Captures, upload/edit, viewer, Recently Deleted
    spotify/    Now playing, controls, lyrics
    globe/      GlobeView: the bridge to the 3D globe page
    home/       Dock, fun facts, notification tab, details toggle
  shared/       Used across features: components (Avatar, StatusGlyph, TermsDialog), hooks, lib (places, time, presence…), types.ts
  mocks/        Mock people shared by the mock services
  assets/       Logos and placeholder images
public/
  globe/        The Blue Marble globe (Three.js + MapLibre), run in an iframe
```

## Security headers

`security-headers.ts` is the one place the app's Content-Security-Policy and its neighbours are
written. The dev server serves them through a plugin in `vite.config.ts`, so a policy problem shows up
in the browser console here rather than after a deploy; `vercel.json` repeats them for production,
because a host sets headers before any build runs, and `npm run build` fails if the two have drifted
apart. Changing where the API lives means changing `API_ORIGIN` in both — see
[docs/deploy.md](../docs/deploy.md#4-point-the-web-app-at-the-api).

The policy allows no inline script at all, which is what makes an injected `<script>` or `onerror=`
inert, and `frame-ancestors 'self'`, which stops another site framing Memoir and laying its own
buttons over the top. `public/globe/` gets a separate, looser policy of its own: it is one long inline
script and loads Three.js and MapLibre from a CDN, so it would otherwise force the whole app's rules
open.

## Sign in

Sign-up emails a confirmation link (printed in the backend's terminal while it has no email server set up); sign-in works once
it's been opened. "Keep me signed in" keeps the session for 30 days; otherwise it ends with the browser. **Sign out** is in the
profile card (or press **L** on the home screen in dev builds). With `VITE_API=mock`, any email and password signs you in.

`features/auth/validation.ts` is what the boxes accept: an allowlist per field, mirroring
`backend/src/lib/validation.ts`, so a character with no business in a field never leaves the browser —
and the server checks the same thing again, because nothing here is trusted there. Passwords are the
deliberate exception: every printable character is allowed, since banning punctuation only makes a
password easier to guess.

The **Terms and Agreements** are `shared/components/terms.ts`, shown by `shared/components/TermsDialog`
from two places: the sign-up form, where passing `onAgree` adds the Agree button — out of reach until
the text has been scrolled to the end — and the profile card, which leaves `onAgree` out and shows the
same text for reading. Bump `TERMS_VERSION` when the wording changes.

## Spotify

**Link** in the profile card's Spotify row links a Spotify account through the backend, which keeps the tokens; see
[Spotify in the backend README](../backend/README.md#spotify) for setting up the Spotify app. Until that's set up, **Link** starts a
**demo player** for trying the top-centre player and the lyrics panel.

Lyrics come from [LRCLIB](https://lrclib.net), a free open lyrics database, because Spotify's API doesn't provide lyrics. Check
lyrics licensing before a public release.

## Globe

`public/globe/` (in `frontend/`) is a copy of the Blue Marble globe (Three.js + MapLibre), run in an iframe. The "Memoir bridge" section of `public/globe/index.html` documents the messages between it and the app.
