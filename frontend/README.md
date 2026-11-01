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
  shared/       Used across features: components (Avatar, StatusGlyph), hooks, lib (places, time, presence…), types.ts
  mocks/        Mock people shared by the mock services
  assets/       Logos and placeholder images
public/
  globe/        The Blue Marble globe (Three.js + MapLibre), run in an iframe
```

## Sign in

Sign-up emails a confirmation link (printed in the backend's terminal while it has no email server set up); sign-in works once
it's been opened. "Keep me signed in" keeps the session for 30 days; otherwise it ends with the browser. **Sign out** is in the
profile card (or press **L** on the home screen in dev builds). With `VITE_API=mock`, any email and password signs you in.

## Spotify

**Link** in the profile card's Spotify row links a Spotify account through the backend, which keeps the tokens; see
[Spotify in the backend README](../backend/README.md#spotify) for setting up the Spotify app. Until that's set up, **Link** starts a
**demo player** for trying the top-centre player and the lyrics panel.

Lyrics come from [LRCLIB](https://lrclib.net), a free open lyrics database, because Spotify's API doesn't provide lyrics. Check
lyrics licensing before a public release.

## Globe

`public/globe/` (in `frontend/`) is a copy of the Blue Marble globe (Three.js + MapLibre), run in an iframe. The "Memoir bridge" section of `public/globe/index.html` documents the messages between it and the app.
