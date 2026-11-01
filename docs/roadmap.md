# Going public, and the three apps

Written for: you, planning the next stage. Nothing here is built yet — this is the shape of the work.

## Where we are

One backend (Node + PostgreSQL) with 38 endpoints and a WebSocket, and one web app (React) that uses
them. Accounts, profile, friends, messaging, calls and posts all work, on your machine.

On the stack name: this is **PERN with Fastify in place of Express** (decided: keep Fastify). Same Node,
same PostgreSQL, same React; Fastify is the part that answers HTTP requests, and it's faster and stricter
about validation. If a course or a client ever insists on Express, it's a rewrite of the seven route
files with no new features at the end of it.

## Two things to decide differently from your sketch

### Images on Cloudinary: yes

Good fit. It stores the file, serves it from its own fast network, and can resize on the way out, so a
phone can ask for a small version of the same photo. It also strips the hidden data in a photo (including
where it was taken) when it re-encodes, which we do today with `sharp`.

What changes: `backend/src/lib/uploads.ts` and `avatars.ts` stop writing to the `uploads/` folder and
upload to Cloudinary instead, keeping the same two functions. The database keeps storing an id/URL per
file, as it already does. Everything above that layer is untouched.

### Text in Redis: no — keep it in PostgreSQL

Redis holds everything in memory and is built to be fast and temporary. It can lose the last seconds of
writes on a restart, and it can't answer the questions this app asks constantly:

- "the last 50 messages in this conversation, oldest first, excluding ones this person deleted"
- "every post whose owner is me **or** that tags me, that isn't in the bin"
- "who is this person friends with"

Those are three joins and an index away in PostgreSQL, and a pile of hand-written bookkeeping in Redis.
Messages are also the one thing people never forgive you for losing.

**Redis is still worth having, for the things it's good at:**

| Job | Why Redis |
| --- | --- |
| Live connections across more than one server | Right now the list of who's online lives in one server's memory. Two servers wouldn't see each other's users. Redis pub/sub joins them. |
| Presence and "listening to Spotify" | Short-lived, changes constantly, no history needed. |
| Rate limits | Currently per-server memory; shared counters are more honest. |
| Caching the heavy reads | The conversation list, a friends list, the Spotify poll. |

So: **PostgreSQL is the truth, Cloudinary holds the files, Redis makes it fast and lets you run more than
one server.** You can launch without Redis and add it the day you run a second server.

## Your question: Flutter without a backend?

**Yes — and that's the right way round.** The Flutter app is a client, like the web app. It signs in,
loads conversations and posts, and opens a WebSocket, all against the same backend as the web.

```
                     ┌──────────────────────────┐
   Web (React)  ───► │                          │
   Desktop (Electron)│   One backend + database │ ──► Cloudinary (photos)
   Mobile (Flutter)──►   api.yourdomain.com     │ ──► Spotify, email, TURN
                     └──────────────────────────┘
```

There is no second database and no second copy of the rules. "How will it fetch the same features?" — by
calling the same URLs. `POST /api/auth/signin`, `GET /api/chat/conversations`, and so on; the list is in
[backend/README.md](../backend/README.md). The backend already speaks plain JSON, so a Dart app reads it
the same way the browser does.

What the Flutter app has to write itself is the **screens**, plus Dart versions of the small data shapes
(a message, a conversation, a post). Think of the API as the contract: the backend promises those shapes,
and each of the three apps draws them in its own way.

## What the backend needs before other apps can use it

Four things, because today it quietly assumes "the only client is a browser on the same address":

1. **A way to sign in without cookies.** The web app's session is an httpOnly cookie, which browsers send
   automatically and scripts can't read — the safest option there. Flutter has no cookie jar by default,
   and on mobile the attack that cookies protect against doesn't exist. So: keep cookies for web and
   Electron, and add a **bearer token** for mobile. Same sessions table, same expiry rules; the client
   just sends `Authorization: Bearer …` instead. About half a day's work.
2. **Allowing other origins (CORS).** Today every request comes from the app's own address, and anything
   else is refused. The deployed API needs to accept the web app's domain and the Electron app, and to
   skip that check for mobile, which sends no origin.
3. **A configurable API address.** The web app calls `/api/…` relative to itself. Electron and Flutter
   need to be told where the backend lives (`VITE_API_URL`, and a constant in Dart).
4. **Push notifications for mobile.** A phone kills the WebSocket when the app goes to the background, so
   "Jack sent you a message" has to come through Apple's and Google's push services. That means a device
   registration endpoint and a sending step wherever we currently push over the socket. This is the
   biggest single piece of new backend work.

Smaller ones: Spotify's sign-in has to come back to the phone through a deep link rather than a web
redirect, and the confirmation email link should open the app when it's installed.

## The globe on mobile

Worth deciding early, because it's the heart of the app. The globe is a web page (Three.js and MapLibre)
that the app talks to through messages. Flutter has no equivalent.

**Decided: reuse it in a WebView.** The same globe, the same pins, one codebase; the bridge it already
has (`public/globe/index.html`, the "Memoir bridge" section) works almost unchanged, with Flutter's
`InAppWebView` passing the same messages the React app passes today. It costs some performance on older
phones, and it means the globe page has to stay touch-friendly — which the mobile view work in step 1
covers anyway.

## Where everything runs

You need a domain name either way (~$12/year). It's needed for HTTPS, for Spotify's redirect, for email
that isn't marked as spam, and for the links that open the mobile app.

| Piece | Choice | Cost |
| --- | --- | --- |
| Web app | **Vercel** (or Cloudflare Pages / Netlify) | free |
| Backend API | **Render** — not Vercel, see below | $0–7/mo |
| PostgreSQL | Neon or Supabase (both have a free tier) | free to start |
| Redis | Upstash | free to start |
| Photos and videos | Cloudinary | free tier ≈ 25 GB |
| TURN (calls) | coturn on a VPS, or Metered (50 GB free) | $0–5/mo |
| Email | Resend (3,000/month free, needs your domain) | free |
| Desktop | Electron, packaged per platform | free (signing costs later) |

**Decided: the managed pieces.** Vercel for the web app, Render for the API, Neon for PostgreSQL,
Upstash for Redis when it's needed, Cloudinary for photos, Metered for TURN. Each has a free tier, each
updates and backs itself up, and nothing runs on your laptop.

### Vercel: yes for the web app and the domain, no for the API

Vercel is a fine home for the React app, and you can buy and manage the domain there too, which keeps the
DNS and the certificates in one dashboard.

The API can't live there. Vercel runs code as *functions*: a request comes in, your code answers, the
function stops. Memoir's backend has to hold a **WebSocket open for hours** — that's how a message
appears without a refresh, how a friend turns Active, and how a call is set up. A function can't hold a
connection open, so the API needs a host that runs a process continuously. Render does; so do Railway,
Fly.io and any VPS.

So the split is:

```
memoir.app        → Vercel      the web app (and the domain lives here)
api.memoir.app    → Render      the API, the WebSocket, uploads to Cloudinary
```

Both under one domain on purpose: a session cookie set for `.memoir.app` is sent to both names, so
sign-in works the same as it does today. (One small change when we deploy: the cookie needs
`domain: .memoir.app` and `sameSite: 'none'` is *not* needed, because subdomains count as the same site.)

What that means in practice when we get to it:

- Accounts to create: Cloudflare (or Vercel), Render, Neon, Cloudinary, Metered, Resend, and a domain
  registrar. I'll give you the exact settings for each; the keys go in Render's environment variables,
  never in the repository.
- Render's free tier puts the API to sleep after 15 minutes idle, so the first request after a quiet
  spell takes a few seconds and the live connection drops while it sleeps. Their $7/month tier doesn't
  sleep — worth it as soon as anyone else is using the app.
- Neon's free database also sleeps, and wakes in about a second.

## Also needed before "public"

- **Spotify's 25-person limit.** A new Spotify app is in development mode: only accounts you list by hand
  can link. Lifting it means applying to Spotify with a real product and a privacy policy, and they
  decline hobby projects. Until then, linking works for you and up to 24 others; everyone else sees the
  demo player.
- **Password reset.** Built into the plan but not written yet; the email machinery is already there.
- **Terms and a privacy policy.** The app links to them already, and Spotify and the app stores ask for
  them.
- **Backups.** A nightly dump of the database. Managed hosts do this; a VPS doesn't unless you set it up.

## Order of work

1. **Hosting** (next). Move the photos to Cloudinary, point the database at Neon, add CORS and the API
   address setting, deploy the API to Render and the web app to Vercel, point the domain at both, then
   switch Spotify's redirect URI, the TURN settings and the email sender to the live ones.

   Why first: browsers only allow the camera, the microphone and calls on an HTTPS address, so a phone
   can't properly test the mobile view against your laptop's dev server. Moving the photos also touches
   the upload code the mobile view uses, so it's better done before than after.
2. **Mobile view of the web app.** The screens already shrink; the globe, the panels and the call overlay
   need real phone layouts. This is also what the Flutter WebView will show, so it pays twice.
3. **Electron.** The thinnest version: a window that loads the hosted web app, plus a tray icon and
   notifications. A day or two, mostly packaging.
4. **Bearer tokens and push notifications** in the backend — the groundwork for mobile.
5. **Flutter app.** Sign in, friends, chat, the globe in a WebView, posting a photo, calls
   (`flutter_webrtc` speaks the same signalling we already have).
6. **Redis**, when one server is no longer enough.

A reasonable first milestone is 1 + 2: the app on the internet, laid out properly on a phone, with
nothing running on your machine.

If you'd rather build screens before opening accounts and buying a domain, the other order works too —
the mobile view doesn't depend on hosting. To test it on your phone in that case, run a free tunnel
(`cloudflared tunnel --url http://127.0.0.1:5173`) to get a temporary HTTPS address your phone can open.
