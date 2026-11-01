import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Spotify only redirects to the loopback IP (not "localhost"), and its redirect URI is
    // http://127.0.0.1:5173/api/spotify/callback, so the dev server must be exactly there.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // The backend (../backend, port 4000) answers under /api. Going through this proxy keeps the app and the
    // API on one origin, so the httpOnly session cookie just works. xfwd passes the real client IP on.
    proxy: {
      // ws: the live connection for messages, presence and calls (/api/ws)
      '/api': { target: 'http://127.0.0.1:4000', xfwd: true, ws: true },
    },
  },
})
