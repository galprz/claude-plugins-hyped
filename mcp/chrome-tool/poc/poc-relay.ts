/**
 * POC 2 — Frame relay fps via local WebSocket
 *
 * Polls Chrome for JPEG frames via captureScreenshot and relays them
 * to a local WS server. Open poc-viewer.html to see the live canvas.
 *
 * Pass: ≥ 5fps sustained, no crash, browser canvas renders frames
 *
 * Usage:
 *   bun run poc/poc-relay.ts
 *   Then open http://localhost:9300 in Chrome to see the viewer
 */
import { WebSocket, WebSocketServer } from 'ws'
import { createServer } from 'http'
import { randomUUID } from 'crypto'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const DAEMON_PORT = parseInt(process.env.CHROME_TOOL_PORT ?? '9222')
const RELAY_PORT = 9300
const SESSION_ID = process.env.SESSION_ID ?? randomUUID()
const INTERVAL_MS = 200  // 5fps target
const QUALITY = 40

// Read the viewer HTML
const VIEWER_HTML = readFileSync(resolve(__dirname, 'poc-viewer.html'), 'utf-8')

type DaemonMsg =
  | { type: 'ready' }
  | { type: 'response'; id: number; result: unknown }
  | { type: 'event'; method: string; params: Record<string, unknown> }
  | { type: 'error'; message: string }

async function main() {
  // ---- HTTP + WS relay server ----
  const httpServer = createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(VIEWER_HTML)
    } else {
      res.writeHead(404); res.end()
    }
  })
  const wss = new WebSocketServer({ server: httpServer })
  const viewers = new Set<WebSocket>()
  wss.on('connection', (ws) => {
    viewers.add(ws)
    ws.on('close', () => viewers.delete(ws))
  })
  httpServer.listen(RELAY_PORT, () => {
    console.log(`Relay server: http://localhost:${RELAY_PORT}`)
    console.log('Open that URL in Chrome, then frames will appear on the canvas.\n')
  })

  // ---- Daemon client ----
  const daemonWs = new WebSocket(`ws://127.0.0.1:${DAEMON_PORT}/client`)
  let nextId = 1
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

  daemonWs.on('message', (raw) => {
    const msg = JSON.parse(raw.toString()) as DaemonMsg
    if (msg.type === 'response') {
      const p = pending.get((msg as { id: number }).id)
      if (p) { pending.delete((msg as { id: number }).id); p.resolve(msg.result) }
    }
  })

  function sendCmd(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = nextId++
    daemonWs.send(JSON.stringify({ type: 'command', session_id: SESSION_ID, id, method, params }))
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error(`Timeout: ${method}`)) }
      }, 5000)
    })
  }

  await new Promise<void>((res, rej) => { daemonWs.once('open', res); daemonWs.once('error', rej) })
  daemonWs.send(JSON.stringify({ type: 'join', session_id: SESSION_ID }))
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error('Timeout waiting for ready')), 15000)
    daemonWs.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as DaemonMsg
      if (msg.type === 'ready') { clearTimeout(t); res() }
      if (msg.type === 'error') { clearTimeout(t); rej(new Error(msg.message)) }
    })
  })
  console.log('Chrome session ready')

  // Navigate the session's own tab to a simple page
  // (Don't use Target.activateTarget — existing tabs may have orphaned debugger attachments)
  console.log('Navigating to example.com...')
  await sendCmd('Page.navigate', { url: 'https://example.com' })
  await new Promise(r => setTimeout(r, 1500))

  // ---- Frame relay loop ----
  console.log(`\nRelaying frames at ${INTERVAL_MS}ms interval (target: ${1000/INTERVAL_MS}fps)\n`)
  const fpsPerSecond: number[] = []
  let frameCount = 0
  let totalBytes = 0

  const secInterval = setInterval(() => {
    fpsPerSecond.push(frameCount)
    const bar = '█'.repeat(Math.min(frameCount, 20))
    console.log(`  Second ${fpsPerSecond.length.toString().padStart(2)}: ${bar} ${frameCount} fps  (${Math.round(totalBytes/frameCount/1024)}KB/frame avg)`)
    frameCount = 0
    totalBytes = 0
    if (fpsPerSecond.length >= 10) {
      clearInterval(secInterval)
      finish()
    }
  }, 1000)

  const poll = async () => {
    try {
      const result = await sendCmd('Page.captureScreenshot', {
        format: 'jpeg', quality: QUALITY,
        clip: { x: 0, y: 0, width: 1280, height: 720, scale: 0.5 },
      }) as { data?: string }
      if (result?.data) {
        frameCount++
        totalBytes += result.data.length
        // Relay to all connected viewers
        for (const viewer of viewers) {
          if (viewer.readyState === WebSocket.OPEN) {
            viewer.send(result.data)
          }
        }
      }
    } catch { /* skip frame on timeout */ }
  }

  // Run poll loop
  const runLoop = async () => {
    while (fpsPerSecond.length < 10) {
      const t0 = Date.now()
      await poll()
      const elapsed = Date.now() - t0
      const wait = INTERVAL_MS - elapsed
      if (wait > 5) await new Promise(r => setTimeout(r, wait))
    }
  }
  runLoop()

  function finish() {
    daemonWs.close()
    httpServer.close()

    console.log('\n--- Result ---')
    const passing = fpsPerSecond.filter(fps => fps >= 5).length
    const avg = fpsPerSecond.reduce((a, b) => a + b, 0) / fpsPerSecond.length
    console.log(`Average fps: ${avg.toFixed(1)}`)
    console.log(`Seconds with ≥5 fps: ${passing}/10`)
    console.log(`Viewers connected: ${wss.clients.size}`)

    if (passing >= 5) {
      console.log('\n✅ PASS — frame relay works at target fps')
      process.exit(0)
    } else {
      console.log('\n❌ FAIL — consider reducing quality or using JPEG blob instead of base64')
      process.exit(1)
    }
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
