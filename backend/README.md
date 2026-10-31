# Memoir — backend

Node + TypeScript (run directly by Node, no build step), Fastify, PostgreSQL (Drizzle ORM).
Done so far: **accounts** (sign up, email confirmation, sign in), the **profile**, and **Spotify linking**.
Next: messaging, then posts and albums.

## Run it

Needs Node 22.18+ and Docker Desktop (for PostgreSQL).

```sh
cd backend
npm install
cp .env.example .env      # then set TOKEN_KEY (the command is in the file)
npm run db:up             # PostgreSQL in Docker
npm run dev               # http://127.0.0.1:4000, restarts on changes
```

Then run the web app (`cd frontend && npm run dev`) and open <http://127.0.0.1:5173>. The web app forwards `/api` here, so the
app and the API share one address and the session cookie just works.

**Confirmation emails** are printed in this terminal while `SMTP_URL` is empty. Click "Confirm my email" there. Set `SMTP_URL`
(any SMTP provider) to send real emails.

| Command | |
| --- | --- |
| `npm run dev` | Start with auto-restart. Applies database migrations first. |
| `npm test` | End-to-end tests of the whole account life against the dev database. |
| `npm run typecheck` | TypeScript check. |
| `npm run db:up` / `db:down` | Start / stop PostgreSQL. Data is kept in a Docker volume. |
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

## Security

- **Passwords:** Argon2id. Wrong password and unknown email get the same answer, in the same time.
- **Sessions:** a random token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). The database only keeps its
  SHA-256. "Keep me signed in" lasts 30 days; otherwise the session ends with the browser, after a day at most.
- **Email confirmation:** single-use links, valid 24 hours, stored hashed. Signing up again on an unconfirmed address replaces
  its details and voids older links, so whoever reads the inbox decides.
- **Input:** every request is validated (zod) and every query is parameterised (Drizzle), which is what stops SQL injection.
  Passwords can contain any characters; names allow letters from any language, spaces, `'`, `-` and `.`.
- **Rate limits:** 300 requests a minute per address overall; sign-up 5, sign-in 10, new links 3, picture uploads 10.
- **Cross-site requests:** changes are only accepted from the app's own origin (`APP_URL`).
- **Uploads:** pictures are decoded and re-encoded, which strips EXIF (including GPS); anything that isn't an image is refused.
- **Spotify:** the client secret and the user's tokens stay on the server; tokens are encrypted at rest (AES-256-GCM, `TOKEN_KEY`).

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
    spotify/           Linking (OAuth) and the player, on the user's behalf
test/                  End-to-end tests (node:test)
```
