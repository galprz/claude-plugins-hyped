import { spawnSync } from 'child_process'
import { mkdirSync, appendFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'
import { createServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import type { BrowserClient } from './types'

// ---- Tailscale detection ----

export function detectTailscaleIP(): string | null {
  const result = spawnSync('tailscale', ['ip', '-4'], { timeout: 3000 })
  if (result.status !== 0 || result.error) return null
  const ip = result.stdout.toString().trim().split('\n')[0]
  return ip && ip.startsWith('100.') ? ip : null
}

// ---- Session recorder ----

export class SessionRecorder {
  readonly sessionDir: string
  private screenshotIndex = 0

  constructor(sessionDir: string) {
    this.sessionDir = sessionDir
    mkdirSync(sessionDir, { recursive: true })
  }

  logAction(entry: string): void {
    const line = `[${new Date().toISOString()}] ${entry}\n`
    appendFileSync(join(this.sessionDir, 'log.txt'), line)
  }

  saveScreenshot(jpegBase64: string): void {
    const idx = ++this.screenshotIndex
    const path = join(this.sessionDir, `screenshot-${idx}.jpg`)
    writeFileSync(path, Buffer.from(jpegBase64, 'base64'))
  }
}

// ---- Canvas viewer HTML ----

const VIEWPORT_W = 1280
const VIEWPORT_H = 720

function buildViewerHtml(wsUrl: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Browser Handoff</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; touch-action: none; }
    body { background: #000; display: flex; flex-direction: column; height: 100vh; overflow: hidden; font-family: -apple-system, sans-serif; }
    #message { background: #1a1a2e; color: #e0e0e0; padding: 12px 16px; font-size: 14px; line-height: 1.4; flex-shrink: 0; }
    #canvas-wrap { flex: 1; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    canvas { max-width: 100%; max-height: 100%; display: block; cursor: crosshair; }
    #status { position: fixed; top: 8px; left: 8px; font-size: 11px; color: #0f0; background: rgba(0,0,0,0.7); padding: 3px 8px; border-radius: 3px; pointer-events: none; }
    #done-btn { position: fixed; top: 8px; right: 8px; background: #e74c3c; color: #fff; border: none; border-radius: 6px; padding: 10px 18px; font-size: 14px; font-weight: bold; cursor: pointer; z-index: 100; }
    #done-btn:active { background: #c0392b; }
    #done-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); align-items: center; justify-content: center; color: #fff; font-size: 20px; z-index: 200; }
  </style>
</head>
<body>
  <div id="message">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  <div id="canvas-wrap">
    <canvas id="canvas"></canvas>
  </div>
  <div id="status">connecting...</div>
  <button id="done-btn">Give AI Control</button>
  <div id="done-overlay">Returning control to AI…</div>
  <script>
    const canvas = document.getElementById('canvas')
    const ctx = canvas.getContext('2d')
    const status = document.getElementById('status')
    const overlay = document.getElementById('done-overlay')
    let scaleX = 1, scaleY = 1
    let lastJpeg = null
    let frameCount = 0, lastFpsTime = Date.now(), fps = 0

    const ws = new WebSocket('${wsUrl}')
    ws.binaryType = 'blob'
    ws.onopen = () => { status.textContent = 'connected'; status.style.color = '#0f0' }
    ws.onclose = () => { status.textContent = 'disconnected'; status.style.color = '#f00' }

    ws.onmessage = (evt) => {
      if (typeof evt.data === 'string') {
        const msg = JSON.parse(evt.data)
        if (msg.type === 'ack') return
        return
      }
      // Frame data (binary JPEG blob)
      lastJpeg = evt.data
      frameCount++
      const now = Date.now()
      if (now - lastFpsTime >= 1000) {
        fps = Math.round(frameCount / ((now - lastFpsTime) / 1000))
        frameCount = 0; lastFpsTime = now
      }
      const url = URL.createObjectURL(evt.data)
      const img = new Image()
      img.onload = () => {
        if (canvas.width !== img.naturalWidth) {
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
        }
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(url)
        // Scale to CDP viewport coords (capture is at 0.5 scale, CDP wants full 1280×720)
        const rect = canvas.getBoundingClientRect()
        scaleX = ${VIEWPORT_W} / rect.width
        scaleY = ${VIEWPORT_H} / rect.height
        status.textContent = fps + ' fps'
      }
      img.src = url
    }

    // Touch → CDP coordinates
    function canvasCoords(e) {
      const rect = canvas.getBoundingClientRect()
      const touch = e.touches ? e.touches[0] || e.changedTouches[0] : e
      return {
        x: Math.round((touch.clientX - rect.left) * scaleX),
        y: Math.round((touch.clientY - rect.top) * scaleY)
      }
    }

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault()
      const { x, y } = canvasCoords(e)
      ws.send(JSON.stringify({ type: 'input', event: 'mousedown', x, y }))
    }, { passive: false })

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault()
      const { x, y } = canvasCoords(e)
      ws.send(JSON.stringify({ type: 'input', event: 'mouseup', x, y }))
      ws.send(JSON.stringify({ type: 'input', event: 'click', x, y }))
    }, { passive: false })

    canvas.addEventListener('click', (e) => {
      const { x, y } = canvasCoords(e)
      ws.send(JSON.stringify({ type: 'input', event: 'click', x, y }))
    })

    document.getElementById('done-btn').addEventListener('click', () => {
      ws.send(JSON.stringify({ type: 'handoff_end' }))
      overlay.style.display = 'flex'
    })
  </script>
</body>
</html>`
}

// ---- Main handoff function ----

export async function startHandoff(client: BrowserClient, message: string): Promise<string> {
  const tailscaleIp = detectTailscaleIP()
  if (!tailscaleIp) {
    return '🤚 Tailscale is not running. Start Tailscale on your Mac and phone, then retry.'
  }

  const handoffId = randomBytes(4).toString('hex')
  const token = randomBytes(4).toString('hex')
  const sessionDir = join(tmpdir(), `handoff-${handoffId}`)
  const recorder = new SessionRecorder(sessionDir)

  // HTTP + WS server on random port
  const httpServer = createServer()
  const wss = new WebSocketServer({ server: httpServer })

  await new Promise<void>(res => httpServer.listen(0, '0.0.0.0', res))
  const port = (httpServer.address() as { port: number }).port

  const wsUrl = `ws://${tailscaleIp}:${port}/ws/${token}`
  const viewerUrl = `http://${tailscaleIp}:${port}/${token}`
  const viewerHtml = buildViewerHtml(wsUrl, message)

  // HTTP handler
  httpServer.on('request', (req, res) => {
    if (req.url === `/${token}` || req.url === `/${token}/`) {
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(viewerHtml)
    } else {
      res.writeHead(404); res.end()
    }
  })

  // Latest frame buffer for screenshots on tap
  let latestFrame: string | null = null

  // Frame polling loop (captureScreenshot every 200ms)
  let polling = true
  const INTERVAL_MS = 100

  const pollLoop = async () => {
    while (polling) {
      const t0 = Date.now()
      try {
        const result = await client.sendCommand('Page.captureScreenshot', {
          format: 'jpeg', quality: 25,
          clip: { x: 0, y: 0, width: VIEWPORT_W, height: VIEWPORT_H, scale: 0.4 },
        }) as { data?: string }
        if (result?.data) {
          latestFrame = result.data
          const buf = Buffer.from(result.data, 'base64')
          for (const viewer of wss.clients) {
            if (viewer.readyState === WebSocket.OPEN) viewer.send(buf)
          }
        }
      } catch { /* skip frame */ }
      const elapsed = Date.now() - t0
      const wait = INTERVAL_MS - elapsed
      if (wait > 5) await new Promise(r => setTimeout(r, wait))
    }
  }

  // WS handler — input forwarding + handoff_end
  let resolveHandoff!: (dir: string) => void
  const handoffComplete = new Promise<string>(res => { resolveHandoff = res })

  wss.on('connection', (viewer) => {
    viewer.on('message', async (raw) => {
      let msg: { type: string; event?: string; x?: number; y?: number }
      try { msg = JSON.parse(raw.toString()) } catch { return }

      if (msg.type === 'handoff_end') {
        polling = false
        httpServer.close()
        recorder.logAction('handoff_end')
        resolveHandoff(sessionDir)
        return
      }

      if (msg.type === 'input' && msg.x !== undefined && msg.y !== undefined) {
        const { event, x, y } = msg
        recorder.logAction(`${event}(${x},${y})`)

        // Save screenshot on every click
        if (event === 'click' && latestFrame) {
          recorder.saveScreenshot(latestFrame)
        }

        // Forward to Chrome via CDP
        try {
          if (event === 'mousedown' || event === 'mouseup' || event === 'click') {
            const cdpType = event === 'mousedown' ? 'mousePressed'
              : event === 'mouseup' ? 'mouseReleased'
              : 'mousePressed'
            await client.sendCommand('Input.dispatchMouseEvent', {
              type: cdpType, x, y, button: 'left', clickCount: 1,
            })
            if (event === 'click') {
              await client.sendCommand('Input.dispatchMouseEvent', {
                type: 'mouseReleased', x, y, button: 'left', clickCount: 1,
              })
            }
          }
        } catch { /* ignore input errors */ }
      }
    })
  })

  // Start polling in background
  pollLoop()

  // Return the viewer URL immediately (fire-and-forget)
  // The handoffComplete promise resolves when user taps "Give AI Control"
  handoffComplete.then(async (dir) => {
    // Notify daemon so Claude resumes
    const chatId = process.env.HYPED_CHAT_ID ?? ''
    const threadId = process.env.HYPED_THREAD_ID ?? ''
    const daemonUrl = process.env.HYPED_DAEMON_URL ?? 'http://localhost:7891'
    if (chatId) {
      try {
        await fetch(`${daemonUrl}/api/handoff-complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: parseInt(chatId), thread_id: threadId ? parseInt(threadId) : null, session_dir: dir }),
        })
      } catch { /* daemon not available */ }
    }
  })

  return viewerUrl
}
