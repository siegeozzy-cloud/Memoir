# Memoir

Share photos and albums as pins on a 3D globe, chat with friends, and show what you're listening to.

| Folder | What's in it |
| --- | --- |
| [`frontend/`](frontend/) | The web app (React + Vite + TypeScript). See [frontend/README.md](frontend/README.md). |
| [`backend/`](backend/) | The API (Node + Fastify + PostgreSQL). Accounts, profile and Spotify linking are done; messaging (WebRTC signalling with STUN/TURN) and posts are next. See [backend/README.md](backend/README.md). |

Run both, in two terminals:

```sh
cd backend && npm install && cp .env.example .env   # set TOKEN_KEY in .env first time
npm run db:up && npm run dev                         # API on :4000 (needs Docker Desktop)

cd frontend && npm install && npm run dev            # app on http://127.0.0.1:5173
```
