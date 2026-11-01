# Memoir — backend

Node + TypeScript (run directly by Node, no build step), Fastify, PostgreSQL (Drizzle ORM).
Done: **accounts** (sign up, email confirmation, sign in), the **profile**, **Spotify linking**, **friends**,
**messaging**, **voice and video calls** (WebRTC with STUN/TURN) and **posts and albums**.

## Run it

Needs Node 22.18+ and Docker Desktop (for PostgreSQL).

```sh
cd backend
npm install
cp .env.example .env      # then set TOKEN_KEY (the command is in the file)
npm run db:up             # PostgreSQL in Docker
npm run turn:up           # TURN relay for calls (optional; see Calls below)
npm run dev               # http://127.0.0.1:4000, restarts on changes
```

Then run the web app (`cd frontend && npm run dev`) and open <http://127.0.0.1:5173>. The web app forwards `/api` here, so the
app and the API share one address and the session cookie just works.

**Confirmation emails** are printed in this terminal while `SMTP_URL` is empty — nothing is sent to a real inbox. Open the
"Confirm my email" link printed there, or run `npm run verify -- you@example.com` to confirm an account without it.
Set `SMTP_URL` to send real emails; with a Gmail account that means two-step verification plus an
[app password](https://myaccount.google.com/apppasswords):

```sh
SMTP_URL=smtps://you%40gmail.com:sixteenletterapppw@smtp.gmail.com:465
MAIL_FROM="Memoir <you@gmail.com>"
```

The server checks these when it starts and says whether email will get out.

| Command | |
| --- | --- |
| `npm run dev` | Start with auto-restart. Applies database migrations first. |
| `npm test` | End-to-end tests (accounts, friends, messaging, posts, calls) against the dev database. |
| `npm run verify -- <email>` | Development only: confirms an account without the email link. |
| `npm run typecheck` | TypeScript check. |
| `npm run db:up` / `db:down` | Start / stop PostgreSQL. Data is kept in a Docker volume. |
| `npm run turn:up` / `turn:logs` | Start / watch the TURN relay (coturn). |
| `npm run db:generate` | After changing `src/db/schema.ts`: write a new SQL migration. |

## API

Everything is under `/api`, JSON in and out. Errors are `{ error: { code, message, field? } }`; `message` is written to be shown
to people, `field` names the form input it's about.

| | |
| --- | --- |
| `POST /auth/signup` `{ name, email, password, acceptedTerms }` | Always answers 202 "check your inbox", so it can't reveal who has an account. Emails a confirmation link. |
| `GET /auth/verify?token=` | The emailed link. Confirms the address and returns to the app with `?verified=1` (or `expired` / `invalid`). |
| `POST /auth/resend-verification` `{ email }` | A new link (at most one every 2 minutes). |
| `POST /auth/signin` `{ email, password, remember }` | Sets the session cookie. Refused until the email is confirmed (a new link is sent). Brings a deactivated account back. |
| `POST /auth/signout` · `GET /auth/session` | |
| `GET /account` · `PATCH /account` `{ name?, status?, notifications? }` | The profile. |
| `PUT /account/avatar` (multipart, one file) | Re-encoded to a 512px WebP; served from `/api/files/avatars/…`. |
| `POST /account/deactivate` · `DELETE /account` | Hide until the next sign-in · delete for good. Both sign out everywhere. |
| `GET /spotify/status` · `GET /spotify/connect` · `DELETE /spotify` | Link status · start linking (a browser navigation) · unlink. |
| `GET /spotify/player`, `PUT /spotify/player/play` · `pause` · `seek` `{ positionMs }` · `repeat` `{ mode }`, `POST …/next` · `previous` | Now playing and controls, on the user's behalf. |
| `GET /friends` · `GET /friends/requests` · `GET /friends/search?q=` | Your friends · requests both ways · find people by name or unique ID. |
| `POST /friends/requests` `{ userId }` · `POST /friends/requests/:id/accept` · `DELETE /friends/requests/:id` · `DELETE /friends/:userId` | Ask · accept · decline or cancel · stop being friends. |
| `GET /chat/conversations` · `POST /chat/conversations` `{ userId }` · `PATCH` · `DELETE /chat/conversations/:id` | The list · open one with a friend · nickname, colour and background · delete (yours only). |
| `GET /chat/conversations/:id/messages` · `POST` (multipart: `text`, `files`) · `POST /chat/conversations/:id/read` | History · send · mark read ("Seen"). |
| `POST /chat/messages/:id/forward` `{ conversationId }` · `DELETE /chat/messages/:id?forEveryone=` | Pass a message on · delete for you, or unsend for everyone. |
| `GET /memories` · `POST` (multipart: `draft`, `files`) · `PATCH /memories/:id` (multipart: `patch`, `files`) | Posts you may see · create · edit. |
| `POST /memories/trash` · `restore` · `purge` `{ ids }` | Recently Deleted, and emptying it. |
| `GET /calls/ice` | STUN addresses, and short-lived TURN credentials when one is set up. |
| `GET /ws` (WebSocket) | Everything pushed without being asked for: messages, presence, friend requests, posts you're tagged in, call signalling. |

## Deploying

[docs/deploy.md](../docs/deploy.md) has the step-by-step. In short: Render runs this service
([render.yaml](../render.yaml) describes it), Neon holds the database, Cloudinary holds the photos.

Two settings change how it behaves away from your machine:

- `API_URL` — this server's public address. Set it and the confirmation email, Spotify's redirect and
  file links all point here instead of at the web app.
- `CLOUDINARY_URL` — set it and uploads go to Cloudinary instead of the local `uploads/` folder.

## Security

- **Passwords:** Argon2id. Wrong password and unknown email get the same answer, in the same time.
- **Sessions:** a random token the database keeps only as a SHA-256. It travels as an `httpOnly`,
  `SameSite=Lax` cookie when the app and the API share an address, and as `Authorization: Bearer …` when
  they don't (the web app on Vercel, and later the phone apps); over the WebSocket it rides in the
  sub-protocol, which is the only header a browser can set there. "Keep me signed in" lasts 30 days;
  otherwise the session ends with the browser, after a day at most.
- **Cross-origin:** only the addresses in `APP_URL` and `EXTRA_ORIGINS` may call the API.
- **Email confirmation:** single-use links, valid 24 hours, stored hashed. Signing up again on an unconfirmed address replaces
  its details and voids older links, so whoever reads the inbox decides.
- **Input:** every request is validated (zod) and every query is parameterised (Drizzle), which is what stops SQL injection.
  Passwords can contain any characters; names allow letters from any language, spaces, `'`, `-` and `.`.
- **Rate limits:** 300 requests a minute per address overall; sign-up 5, sign-in 10, new links 3, picture uploads 10.
- **Cross-site requests:** changes are only accepted from the app's own origin (`APP_URL`).
- **Uploads:** pictures are decoded and re-encoded, which strips EXIF (including GPS); anything that isn't an image is refused.
- **Spotify:** the client secret and the user's tokens stay on the server; tokens are encrypted at rest (AES-256-GCM, `TOKEN_KEY`).
- **Who may see what:** conversations are readable only by the people in them; a post only by its owner and the
  people tagged; you can only message, call or tag a friend. Every read checks this in the query itself.

## Calls

Voice and video go straight between the two devices (WebRTC). The server only passes the setup messages along
over the WebSocket and hands out the addresses of the helper servers:

- **STUN** tells a device how it looks from the outside, which is enough to find a direct path on most home
  networks. `STUN_URLS` defaults to Google's public server.
- **TURN** relays the call when a network won't allow a direct path (often mobile data or office networks).
  `npm run turn:up` starts [coturn](https://github.com/coturn/coturn) from docker-compose.yml on port 3478.
  Credentials are worked out from `TURN_SECRET` and expire after an hour, so there are no accounts to keep.

Browsers only allow camera and microphone access on a secure page, which `http://127.0.0.1:5173` counts as.
Opening the app from another machine on your network needs HTTPS.

## Spotify

1. Create an app at <https://developer.spotify.com/dashboard> with the redirect URI `http://127.0.0.1:5173/api/spotify/callback`
   and the Web API.
2. In its **User Management**, add the Spotify accounts that will test it (apps in development mode only work for those).
3. Put its Client ID and Client secret in `.env` (`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`) and restart.

Without them, **Link** in the profile starts the demo player instead. Showing what's playing works on any account; play/pause,
skip, seek and repeat need Spotify Premium.

## Folders

```
src/
  server.ts, app.ts    Start-up; plugins, security hooks, routes
  config.ts            Settings from .env, checked at start-up
  db/                  schema.ts (tables), client.ts, migrations/
  lib/                 sessions, errors, validation rules, crypto, mailer
  features/
    auth/              Sign up, confirm email, sign in/out, the emails
    account/           Profile, picture, deactivate, delete
    friends/           Find people, requests, friendships
    chat/              Conversations, messages, attachments, forwarding
    memories/          Posts and albums, tags, Recently Deleted
    calls/             ICE/TURN credentials and call signalling
    spotify/           Linking (OAuth), the player, and friends' "listening to"
test/                  End-to-end tests (node:test)
```
