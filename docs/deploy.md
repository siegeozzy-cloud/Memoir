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

What the free plan gives you, **per project**: **100 CU-hours** of compute a month, 1 GB of storage,
and 5 GB of network transfer. The compute number is the one that matters, and it is not 100 hours of
wall-clock time — it is 100 *compute-unit* hours, and the smallest compute is 0.25 CU, so it buys
about **400 hours of the database being awake**, against 744 hours in a month. Neon suspends the
compute after 5 minutes with no queries, which can't be turned off on the free plan, so what you are
really budgeting is **how many hours a day anything is talking to the database — about 13**.

Run past it and the compute is suspended until the next billing period: connections drop and the app
is down. Nothing is deleted, and there are no overage charges. Step 9 is about staying under it.

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

Everything lands under a `memoir/` folder in your account, so the same account can hold other projects
**without their file names running into each other** — but be clear that this is the only thing the
folder separates. The free plan's **25 credits a month are per account and shared by everything in it**
(1 credit = 1 GB stored, or 1 GB delivered, or 1,000 resizes). A second project in the same Cloudinary
account spends Memoir's allowance, and Memoir's photos are what stop being delivered. Sub-accounts,
which would separate the quota too, are a paid feature. One account per project, if you can.

Note that storage is a *snapshot*, not a monthly bucket: what you are holding right now is what it
counts, so it creeps up for as long as nobody deletes anything. Only the 30-day Recently Deleted sweep
prunes anything automatically, and only posts.

Photos are still shrunk and stripped of their hidden data (including the GPS location) before they leave
the server. They are also now **delivered through Cloudinary's resizer** rather than as stored — see
step 9.

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

**The free plan's bandwidth allowance is 5 GB a month, not 100.** Render cut it by twenty on
1 August 2026, when every workspace was moved onto the new plans; a lot of what is written about
Render's free tier still quotes the old number. Past 5 GB it is $0.15 a GB, or — with no card on the
account — every service in the workspace is spun down until the 1st. Both the bandwidth and the
instance hours are **per workspace, pooled across every service and static site in it**, so a second
project living in the same workspace shares them. Only *outbound* traffic is counted; uploads coming
in are free, which matters more than it sounds — see step 9.

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

**The same trap, one level in: a timer that runs while people are merely connected.** Pinging the API
is not the only thing that can hold the database open. The Spotify sweep
(`backend/src/features/spotify/activity.ts`) runs every ten seconds for as long as *anybody* has a
socket open, and it used to read each connected person's status and Spotify link out of Postgres each
time. That is a query every ten seconds with nobody doing anything — so Neon never suspended, and one
client that just stayed connected (a desktop app sitting in the tray is the obvious way to cause this)
spent all 100 CU-hours by around the 17th and took the app down for the rest of the month.

Those rows are now cached in memory for the people who are online (`backend/src/lib/user-cache.ts`,
and the link cache in `features/spotify/client.ts`), so a connected-but-idle person costs **no
queries at all** and the database is awake only while somebody is actually doing something. If you
add anything else on a timer, the rule is the same as for `/api/ping`: **it must not touch the
database.** Those two cache files name every place that has to invalidate them; a missed one shows up
as a stale status, never as an error.

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

Three meters, and they bind in this order: **Neon's compute first, then Cloudinary's credits, then
Render's bandwidth.**

| | Free allowance | What spends it |
| --- | --- | --- |
| Neon | 100 CU-hours ≈ 400 hours awake | hours a day that anybody is using the app |
| Cloudinary | 25 credits (storage **and** delivery) | photos stored, and photos looked at |
| Render | 5 GB outbound, 750 instance hours | JSON, socket frames, and bytes sent *to* Cloudinary and Spotify |

Most of what *the app* sends never touches Render's meter — the globe's 32 MB of textures and tiles come
from Vercel, photos and videos from Cloudinary, album art from Spotify, and call audio and video go
device to device. But "Render only carries JSON and WebSocket frames" is not quite true, and the gap is
worth knowing:

- **An upload crosses Render's meter once, on its way out to Cloudinary.** Inbound is free, so the
  phone sending a 15 MB photo costs nothing; the server then forwarding it to Cloudinary is outbound
  and is counted. Photos are re-encoded down first, so they leave as a few hundred KB. **Videos in
  messages are not re-encoded** — they go as they arrived, up to 25 MB each, which means **roughly 340
  of them is the entire 5 GB**. It is the sharpest edge in the whole setup. If it starts to bite, the
  fix is a signed upload straight from the browser to Cloudinary, which takes those bytes off Render
  altogether (Cloudinary can strip the EXIF data and resize on the way in, so nothing is lost).
- **Asking Spotify costs outbound too** — one small request per listener every ten seconds. It is a
  few hundred MB a month at a handful of listeners, and it scales with how many people are listening
  at once, not with how many have accounts.

A few deliberate choices keep the rest small:

- **Answers are compressed** (`@fastify/compress` in `app.ts`). JSON gzips to roughly a fifth of its
  size, and nothing in front of this server does it for you.
- **Nothing polls over HTTP.** New messages, presence, friend requests, tagged posts and now-playing
  all arrive pushed down one WebSocket. The Spotify bar used to ask `/api/spotify/player` every four
  seconds — about 900 requests an hour per open tab, which on its own was most of a month's budget.
  The server asks Spotify instead and pushes only what changed, at the moments something can have
  changed: a 10-second heartbeat for anything done elsewhere (their phone, the desktop app), a burst
  of three checks right after one of our own buttons is pressed, and a check timed to land just as
  the current track runs out. Between those the tab advances the bar on its own clock, and only a
  slip of more than a second is corrected — the bound that keeps time-synced lyrics honest.
- **Lists revalidate.** `/api/memories`, `/api/chat/conversations` and a conversation's messages carry
  an ETag, so reopening the app when nothing has changed costs a 304 — a couple of hundred bytes
  instead of the whole list.
- **Uploads are capped**, in the app and again on the server (`backend/src/lib/uploads.ts`, `LIMITS`):
  15 MB a photo on a post, 25 MB a file in a message, 10 MB for a profile picture. Photos are
  re-encoded down to 2048px JPEG before they are stored, so what Cloudinary keeps is far smaller than
  what was sent. Change the number in both places or they drift.
- **Pictures are delivered at the size they are shown**, not the size they were stored
  (`backend/src/lib/storage.ts`, `TRANSFORM`). Every grid of thumbnails used to download full 2048px
  photos — one screen of a photo grid was about 18 MB, and a few people browsing was the whole 25
  credits. The API now hands back a `thumbUrl` beside each `url`, 600px wide, and every place that
  shows a picture at tile size uses it: the post grid, the viewer's filmstrip, the media grid in a
  conversation's info panel, and pictures in a chat bubble, which are capped at 300px by CSS and had
  nothing to open the full copy with anyway. Both URLs also carry `f_auto,q_auto`, so a browser that
  takes AVIF or WebP gets one. Together that is around ten times less delivered for no visible
  difference. Cloudinary builds each derived copy once, on first request, and caches it — at 1,000
  resizes to the credit, they cost almost nothing against the bytes they save.

  In development there is no Cloudinary, so `thumbUrl` is absent and the app falls back to `url`:
  the grids show full-size pictures locally. Read it as `thumbUrl ?? url` anywhere new.

The thing most likely to undo all of this is adding an endpoint the app polls on a timer, adding a
*server* timer that queries the database (see step 8), or streaming a Cloudinary file through the API
instead of handing back its URL — that last one puts the bytes on Render's meter for no reason at all.

**What to watch, and where.** Neon → Usage (CU-hours) is the one to look at first and the one that
takes the app down rather than charging you. Cloudinary → Dashboard shows credits, and it warns by
email well before it disables anything. Render → Metrics is per service, Render → Billing is the
workspace total.

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
