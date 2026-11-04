# Putting Memoir online

Written for: you, doing this once. Everything below is free except the optional pieces at the end.

The app is already on Vercel at **memoir-album.vercel.app**; it just has nothing to talk to. This adds
the three things it needs: a database, somewhere to keep photos, and a running API.

Because the app (`vercel.app`) and the API (`onrender.com`) are two different sites, a browser won't
carry a sign-in cookie between them. The code now handles that: sign-in hands back a token, which the app
keeps and sends with every call, and the live connection passes it in the WebSocket's sub-protocol. When
you buy a domain later, switch to cookies by putting the app and API on one domain — nothing else has to
change.

## 1. The database (Neon)

1. Sign up at <https://neon.tech> and create a project called `memoir`.
2. Copy the connection string. It looks like
   `postgresql://user:password@ep-something.eu-central-1.aws.neon.tech/memoir?sslmode=require`.
3. Keep it for step 4. Nothing to set up inside it: the API creates the tables on its first start.

## 2. Photos and videos (Cloudinary)

1. In the Cloudinary console, open **Settings → API Keys** (or the **Dashboard** card headed *Product
   Environment Credentials*). Copy the **cloud name**, **API key** and **API secret** — the real ones,
   not the `<your_api_key>` text shown in their documentation. The secret is hidden until you click the
   eye or copy button.
2. Put them together into one value:

   ```
   cloudinary://<API key>:<API secret>@<cloud name>
   ```

   For example, with cloud name `fzpweior`: `cloudinary://123456789012345:AbCdEf-GhIjKlMnOp@fzpweior`.
3. In Render, the **Key** is `CLOUDINARY_URL` and the **Value** is only that line — no `CLOUDINARY_URL=`
   in front of it, and no quotes around it.

That one value is all the API needs. With it set, uploads go to Cloudinary; without it, they go to a
local folder, which is what happens on your machine.

If it's wrong, the server now says so on start-up ("CLOUDINARY_URL still has the <your_api_key>
placeholders in it") instead of crashing with a stack trace.

Everything lands under a `memoir/` folder in your account, so the same account can hold other projects.
Photos are still shrunk and stripped of their hidden data (including the GPS location) before they leave
the server.

## 3. The API (Render)

1. Push the repository to GitHub (`main`).
2. At <https://render.com> → **New → Blueprint**, pick the `Memoir` repository. Render reads
   [`render.yaml`](../render.yaml) and offers a service called `memoir-api`.
3. Fill in the values it asks for:

   | Setting | Value |
   | --- | --- |
   | `DATABASE_URL` | the Neon string from step 1 |
   | `CLOUDINARY_URL` | the Cloudinary string from step 2 |
   | `TOKEN_KEY` | run `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `API_URL` | `https://memoir-api-zm7v.onrender.com` — Render adds a random suffix of its own, so take the address from its dashboard rather than guessing it |
   | `APP_URL` | `https://memoir-album.vercel.app` |
   | `BREVO_API_KEY`, `MAIL_FROM` | see step 6 — leave empty to start |
   | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | from your Spotify app |
   | `TURN_URL`, `TURN_SECRET` | see step 7 — leave empty to start |
   | `EXTRA_ORIGINS` | leave empty for now |

4. Deploy. When it's up, `https://…onrender.com/api/health` should answer `{"ok":true,"db":true}` —
   that one checks the database too, so it proves `DATABASE_URL` is right. If you had to guess
   `API_URL`, correct it now and redeploy.

There are two health routes, and the difference matters on the free plan:

| Route | Checks | Called by |
| --- | --- | --- |
| `/api/ping` | that the server is answering | Render's health check, and the keep-alive job in step 8 — constantly, forever |
| `/api/health` | the above, plus a query to the database | you, by hand, when something looks wrong |

`/api/ping` deliberately touches no database. Anything called every few minutes must not, or Neon's
compute never gets to idle — see step 8.

**Render's free plan sleeps** after 15 minutes with no traffic. The next visit takes 30–60 seconds to
wake, and the live connection drops while it sleeps, so messages won't arrive until the app reconnects.
Step 8 keeps it awake for free; $7/month stops it sleeping with no tricks, and is worth it as soon as
anyone else uses it daily.

## 4. Point the web app at the API

In Vercel → your project → **Settings → Environment Variables**:

```
VITE_API_URL = https://memoir-api-zm7v.onrender.com
```

Add it for Production (and Preview, if you want branch builds to work), then redeploy. Vite only reads
variables at build time, so a redeploy is required — changing it without one does nothing.

**If the API ever moves, two more files have to say so.** The app is served with a
Content-Security-Policy, which lists the addresses a browser is allowed to load from. The API has to be
on that list, or every call from the deployed app is blocked and the console fills with

> Refused to connect … because it violates the document's Content Security Policy

The address is written in:

- `frontend/security-headers.ts` — `API_ORIGIN` at the top, the one place to change
- `frontend/vercel.json` — four times inside the long `Content-Security-Policy` value (`connect-src`
  as both `https://…` and `wss://…`, then `img-src` and `media-src`), because a host sets headers
  before any build runs and so can't work them out

Change `API_ORIGIN`, run `npm run build` in `frontend`, and the build fails with the exact value to
paste into `vercel.json`. That check is there so the two can't quietly drift apart.

Both currently read `https://memoir-api-zm7v.onrender.com`, which is the suffixed address Render gave
the service — not the `memoir-api.onrender.com` that `render.yaml`'s service name suggests.

## 5. Spotify

In the Spotify dashboard, open your app's settings and **add a second redirect URI**:

```
https://memoir-api-zm7v.onrender.com/api/spotify/callback
```

Keep the `http://127.0.0.1:5173/api/spotify/callback` one so local development still works. Spotify
allows several.

Remember the 25-person limit: everyone who links their Spotify has to be listed under **User Management**
until Spotify grants extended access.

## 6. Email

Use [Brevo](https://www.brevo.com) — 300 emails a day free, no domain needed, and it works where SMTP
doesn't because it's an ordinary HTTPS call.

1. Sign up at [brevo.com](https://www.brevo.com). It asks what you're sending; "transactional" is the
   honest answer, and the free Starter plan is enough.
2. **Senders, domains & dedicated IPs → Senders → Add a sender.** Use the address you want the emails
   to come from (your Gmail is fine). Brevo emails it a confirmation link — open it. Until you do,
   every send is refused.
3. **SMTP & API → API keys → Generate a new API key.** Copy it now; Brevo won't show it again.
4. In Render → your service → **Environment**:

   ```
   BREVO_API_KEY = xkeysib-…
   MAIL_FROM     = Memoir <the-address-you-verified>
   ```

   No quotes in a dashboard — `.env` files eat them, but Render keeps them as part of the value. (The
   server strips a stray pair anyway, so an old value with quotes still works.)

5. Redeploy. The log should say `Email: sending through Brevo as …`. If something's wrong it says what,
   and locally `npm run mail -- you@example.com` tells you the same thing faster.

With `BREVO_API_KEY` empty the API prints confirmation links in Render's log instead — which works, but
everyone signing up would have to ask you for their link. `SMTP_URL` is still read when
`BREVO_API_KEY` isn't set, for any other mail server; Brevo's own relay is
`smtp://<login>:<smtp-key>@smtp-relay.brevo.com:587`, though hosts and home networks sometimes block
that port.

Sent email is listed under **Transactional → Logs** in Brevo, with what happened to each one
(delivered, bounced, marked as spam). When you do buy a domain, verify it in Brevo and send from
`no-reply@yourdomain` — mail from your own domain is far less likely to be treated as spam than mail
from a Gmail address Brevo sends on behalf of.

## 7. Calls

STUN alone is enough for most home networks, and the default public STUN server needs no setup. For
calls that cross stricter networks, add a TURN relay:

1. Sign up at <https://metered.ca> (50 GB a month free) and create a TURN app.
2. They give you a server address and credentials. Set `TURN_URL` and `TURN_SECRET` on Render.

Calls also need HTTPS, which both Vercel and Render give you.

## 8. Keeping it awake (cron-job.org)

The free plan sleeps after 15 minutes of quiet. A request every 14 minutes keeps it up.

1. Sign up at <https://cron-job.org> — free, unlimited jobs, and it can fire as often as once a minute.
2. **Create cronjob.** Title it `Memoir keep-alive`.
3. URL: `https://memoir-api-zm7v.onrender.com/api/ping` — the ping route, **not** `/api/health`.
4. Schedule: choose **Every 14 minutes** (custom → minutes `*/14`). Not 15: spin-down is *at* 15
   minutes of inactivity, so 15 sits exactly on the edge and a few seconds of jitter loses the race.
5. Leave the rest alone and save. The execution history shows a green 200 every 14 minutes; it emails
   you if the job starts failing, which doubles as uptime alerting.

**Why `/api/ping` and not `/api/health`.** `/api/health` runs `select 1`. A query every 14 minutes,
around the clock, resets Neon's idle timer every time, so its compute never suspends — and Neon's free
plan meters compute time. You'd keep Render awake by quietly burning your database allowance instead.
`/api/ping` answers from memory and touches nothing. `render.yaml` points Render's own health check at
it for the same reason.

**This is why you only get one always-on service.** Free instance hours are **750 a month, pooled
across your whole account**:

| | Instance hours used |
| --- | --- |
| Asleep when idle (no pinging) | 100–300 |
| Pinged every 14 minutes | **~730** (a 31-day month is 744) |

One service pinged around the clock fits, with a few hours to spare. **Two would need ~1,460 and blow
the quota in a fortnight.** So if you ever add a second Render service — a worker, a second API, a
coturn container — either stop pinging one of them or move to a paid instance. Redeploys briefly run
two instances at once, so don't push 50 times on the last day of the month either.

Worth knowing: Render's own documentation discourages keep-alive pinging on free instances. It is a
common thing to do, but it is their plan and their rules, so it's a judgement call — and if they ever
clamp down, the fallback is the $7 instance, which doesn't sleep and needs no cron job.

Electron and Flutter need **no** Render service of their own. The desktop build is a binary people
install, the mobile build comes from a store or a direct download, and the web app is on Vercel. All
three talk to this one API and the same database, so adding clients costs you no instance hours at all
— only requests.

## 9. Staying inside the free limits

Watch **Render → your service → Metrics** for bandwidth and **Neon → your project → Usage** for compute
hours. Neon's is the one more likely to bite first.

Most of what the app sends never touches Render's meter — the globe's 32 MB of textures and tiles come
from Vercel, photos and videos from Cloudinary, album art from Spotify, and call audio and video go
device to device. Render only carries JSON and WebSocket frames. A few deliberate choices keep that
small:

- **Answers are compressed** (`@fastify/compress` in `app.ts`). JSON gzips to roughly a fifth of its
  size, and nothing in front of this server does it for you.
- **Nothing polls over HTTP.** New messages, presence, friend requests, tagged posts and now-playing
  all arrive pushed down one WebSocket. The Spotify bar used to ask `/api/spotify/player` every four
  seconds — about 900 requests an hour per open tab, which on its own was most of a month's budget.
  The server asks Spotify once every 15 seconds for everyone online and pushes only what changed.
- **Lists revalidate.** `/api/memories`, `/api/chat/conversations` and a conversation's messages carry
  an ETag, so reopening the app when nothing has changed costs a 304 — a couple of hundred bytes
  instead of the whole list.
- **Uploads are capped**, in the app and again on the server (`backend/src/lib/uploads.ts`, `LIMITS`):
  15 MB a photo on a post, 25 MB a file in a message, 10 MB for a profile picture. Photos are
  re-encoded down to 2048px JPEG before they are stored, so what Cloudinary keeps is far smaller than
  what was sent. Change the number in both places or they drift.

Roughly, at 50 people using it properly, that comes to **well under a gigabyte a month** of Render
traffic. The thing most likely to undo it is adding an endpoint that the app polls on a timer, or
streaming a Cloudinary file through the API instead of handing back its URL — that puts the bytes on
Render's meter for no reason.

## 10. Check it

1. Open <https://memoir-album.vercel.app>, create an account.
2. Confirm the email (your inbox, or the link in Render's log).
3. Sign in, open the profile, change your name and upload a picture — the picture should appear in your
   Cloudinary library under `memoir/avatars`.
4. From a second browser (or your phone), sign up as someone else, add the first by unique ID, accept,
   and send a message. It should arrive without a refresh.
5. Try a call between the two.

## Afterwards

- **A domain** (~$12/year, Vercel can sell and manage it): the app on `memoir.app`, the API on
  `api.memoir.app`. Then sign-in goes back to the cookie, email comes from your own address, and the
  mobile app can open links. Nothing in the code has to change apart from the environment variables.
- **Backups.** Neon keeps a recent history on the free plan; check how far back before you depend on it.
- **Keeping secrets out of the repository.** `.env` is ignored by git; the real values live only in
  Render and Vercel. If one leaks, change it there and redeploy.
