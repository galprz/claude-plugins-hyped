import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync } from 'node:fs'
import { request as httpRequest } from 'node:http'
import { resolve } from 'node:path'

const PLAN_TOKEN = process.env.PLAN_TOKEN ?? ''

function isAuthorized(url: string | undefined, authHeader: string | string[] | undefined): boolean {
  if (!PLAN_TOKEN) return true
  // Authorization header (used by API calls from the browser)
  if (typeof authHeader === 'string') {
    const expected = `Basic ${Buffer.from(`hyped:${PLAN_TOKEN}`).toString('base64')}`
    if (authHeader === expected) return true
  }
  // _token query param (used by page loads / direct URL visits)
  const qs = url?.split('?')[1] ?? ''
  if (new URLSearchParams(qs).get('_token') === PLAN_TOKEN) return true
  return false
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'plan-viewer-api',
      configureServer(server) {
        // Gate: protect the HTML entry point and API endpoints only.
        // Asset/module requests (JS, CSS, /@vite, /src) are allowed through — they're
        // useless without the protected HTML, and browsers don't carry query params on sub-requests.
        server.middlewares.use((req, res, next) => {
          const path = req.url?.split('?')[0] ?? ''
          // Only gate the HTML entry and the API endpoints
          const isEntry = path === '/' || path === '/index.html'
          const isApi = path === '/save-feedback' || path === '/notify'
          if (!isEntry && !isApi) return next()
          if (!isAuthorized(req.url, req.headers['authorization'])) {
            res.statusCode = 401
            res.setHeader('Content-Type', 'text/plain')
            res.end('Unauthorized')
            return
          }
          next()
        })

        server.middlewares.use('/save-feedback', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const feedbackPath = resolve(server.config.root, 'review.json')
              writeFileSync(feedbackPath, body, 'utf8')
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            } catch (e) {
              res.statusCode = 500
              res.end(JSON.stringify({ error: String(e) }))
            }
          })
        })

        server.middlewares.use('/notify', (req, res) => {
          if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
          let body = ''
          req.on('data', chunk => { body += chunk })
          req.on('end', () => {
            try {
              const { chat_id } = JSON.parse(body)
              const feedbackPath = resolve(server.config.root, 'review.json')
              const payload = JSON.stringify({ chat_id, feedback_path: feedbackPath })
              const daemonReq = httpRequest({
                host: '127.0.0.1', port: 7891,
                path: '/api/plan-reviewed', method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
              }, r => { res.statusCode = r.statusCode ?? 200; res.end() })
              daemonReq.on('error', () => { res.statusCode = 502; res.end() })
              daemonReq.write(payload)
              daemonReq.end()
            } catch (e) {
              res.statusCode = 400; res.end(String(e))
            }
          })
        })
      },
    },
  ],
  resolve: { alias: { '@': resolve(__dirname, './src') } },
  server: { allowedHosts: true },
})
