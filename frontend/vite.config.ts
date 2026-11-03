import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { appCsp, commonHeaders, globeCsp, isGlobePath } from './security-headers.ts'

/**
 * Development gets the same security headers the deployed app does, so a Content-Security-Policy
 * problem shows up in the browser console here rather than after a deploy. The globe page is served
 * a looser policy than the app, exactly as in vercel.json, so the split is tested too.
 */
function securityHeaders(): Plugin {
  const app = appCsp({ dev: true })
  const globe = globeCsp({ dev: true })
  const common = commonHeaders({ dev: true })
  return {
    name: 'memoir:security-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
        res.setHeader('Content-Security-Policy', isGlobePath(pathname) ? globe : app)
        for (const [key, value] of Object.entries(common)) res.setHeader(key, value)
        next()
      })
    },
  }
}

/**
 * A host sets headers before it runs a build, so vercel.json has to spell its policies out rather
 * than import them. This fails the build when they no longer match security-headers.js, and prints
 * the value to paste in.
 */
function checkDeployedHeaders(): Plugin {
  return {
    name: 'memoir:check-deployed-headers',
    apply: 'build',
    buildStart() {
      const config = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
        headers: { source: string; headers: { key: string; value: string }[] }[]
      }
      const deployed = (source: string, key: string) => config.headers.find((r) => r.source === source)?.headers.find((h) => h.key === key)?.value
      const expected: [source: string, key: string, value: string][] = [
        ['/((?!globe).*)', 'Content-Security-Policy', appCsp({ dev: false })],
        ['/globe/:path*', 'Content-Security-Policy', globeCsp({ dev: false })],
        ...Object.entries(commonHeaders({ dev: false })).map(([key, value]): [string, string, string] => ['/(.*)', key, value]),
      ]
      for (const [source, key, value] of expected) {
        if (deployed(source, key) === value) continue
        this.error(`vercel.json is out of date: ${key} for "${source}" doesn’t match security-headers.js.\n\nPut this in vercel.json:\n\n${value}\n`)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), securityHeaders(), checkDeployedHeaders()],
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
