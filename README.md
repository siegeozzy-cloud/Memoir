# Memoir

Share photos and albums as pins on a 3D globe, chat with friends, and show what you're listening to.

| Folder | What's in it |
| --- | --- |
| [`frontend/`](frontend/) | The web app (React + Vite + TypeScript). See [frontend/README.md](frontend/README.md). |
| [`backend/`](backend/) | The API (Node + Fastify + PostgreSQL): accounts, profile, Spotify linking, friends, messaging, calls (WebRTC with STUN/TURN) and posts. See [backend/README.md](backend/README.md). |

Live at **[memoir-album.vercel.app](https://memoir-album.vercel.app)** once the API is deployed —
see [docs/deploy.md](docs/deploy.md). The plan for what comes next is in [docs/roadmap.md](docs/roadmap.md).

Run both locally, in two terminals:

```sh
cd backend && npm install && cp .env.example .env   # set TOKEN_KEY in .env first time
npm run db:up && npm run dev                         # API on :4000 (needs Docker Desktop)
# npm run turn:up                                    # optional: TURN relay, for calls across networks

cd frontend && npm install && npm run dev            # app on http://127.0.0.1:5173
```
