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

1. In the Cloudinary dashboard, open **Programmable Media → Dashboard** and copy the **API environment
   variable**: `cloudinary://<api key>:<api secret>@<cloud name>`.
2. That one value is all the API needs. With it set, uploads go to Cloudinary; without it, they go to a
   local folder, which is what happens on your machine.

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
   | `API_URL` | `https://memoir-api.onrender.com` (Render shows the real one; fill it in after the first deploy) |
   | `APP_URL` | `https://memoir-album.vercel.app` |
   | `SMTP_URL`, `MAIL_FROM` | see step 6 — leave empty to start |
   | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | from your Spotify app |
   | `TURN_URL`, `TURN_SECRET` | see step 7 — leave empty to start |
   | `EXTRA_ORIGINS` | leave empty for now |

4. Deploy. When it's up, `https://…onrender.com/api/health` should answer `{"ok":true}`. If you had to
   guess `API_URL`, correct it now and redeploy.

**Render's free plan sleeps** after 15 minutes with no traffic. The next visit takes a few seconds to
wake, and the live connection drops while it sleeps, so messages won't arrive until the app reconnects.
That's fine for showing the app to people; $7/month stops it sleeping, and is worth it as soon as anyone
else uses it daily.

## 4. Point the web app at the API

In Vercel → your project → **Settings → Environment Variables**:

```
VITE_API_URL = https://memoir-api.onrender.com
```

Add it for Production (and Preview, if you want branch builds to work), then redeploy. Vite only reads
variables at build time, so a redeploy is required — changing it without one does nothing.

## 5. Spotify

In the Spotify dashboard, open your app's settings and **add a second redirect URI**:

```
https://memoir-api.onrender.com/api/spotify/callback
```

Keep the `http://127.0.0.1:5173/api/spotify/callback` one so local development still works. Spotify
allows several.

Remember the 25-person limit: everyone who links their Spotify has to be listed under **User Management**
until Spotify grants extended access.

## 6. Email

Without a domain, use your Gmail with an [app password](https://myaccount.google.com/apppasswords)
(2-Step Verification has to be on first):

```
SMTP_URL  = smtps://you%40gmail.com:sixteenletterapppassword@smtp.gmail.com:465
MAIL_FROM = "Memoir <you@gmail.com>"
```

The `%40` stands for the `@`. With these empty, the API prints confirmation links in Render's log
instead — which works, but everyone signing up would have to ask you for their link.

When you do buy a domain, move to [Resend](https://resend.com) (3,000 free emails a month): mail from
your own domain is far less likely to be treated as spam.

## 7. Calls

STUN alone is enough for most home networks, and the default public STUN server needs no setup. For
calls that cross stricter networks, add a TURN relay:

1. Sign up at <https://metered.ca> (50 GB a month free) and create a TURN app.
2. They give you a server address and credentials. Set `TURN_URL` and `TURN_SECRET` on Render.

Calls also need HTTPS, which both Vercel and Render give you.

## 8. Check it

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
