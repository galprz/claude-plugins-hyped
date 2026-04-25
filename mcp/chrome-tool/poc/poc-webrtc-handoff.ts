/**
 * POC: tabCapture → WebRTC → browser viewer
 * Pass: <video> in browser shows tab stream (non-zero videoWidth)
 *
 * Usage:
 *   1. Copy extension files + reload Chrome extension (chrome://extensions)
 *   2. bun run poc/poc-webrtc-handoff.ts
 *   3. Open the printed URL in a browser — should see live tab video
 */
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { randomBytes } from 'crypto'

const TOKEN = randomBytes(4).toString('hex')
const TAILSCALE_IP = process.env.TAILSCALE_IP ?? '127.0.0.1'

// ---- Signaling relay ----
const http = createServer()
const wss = new WebSocketServer({ server: http })

let host: WebSocket | null = null
let viewer: WebSocket | null = null
let bufferedOffer: string | null = null

const viewerHtml = (wsUrl: string) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>body{margin:0;background:#000} video{width:100vw;height:100vh;object-fit:contain}
#s{position:fixed;top:8px;left:8px;color:#0f0;font-family:monospace;background:rgba(0,0,0,.7);padding:4px 8px;border-radius:4px}</style>
</head><body>
<video id="v" autoplay playsinline muted></video>
<div id="s">connecting...</div>
<script>
const pc = new RTCPeerConnection({ iceServers: [] })
const ws = new WebSocket('${wsUrl}')
const s = document.getElementById('s')
ws.onopen = () => ws.send(JSON.stringify({ type: 'role', role: 'viewer' }))
ws.onmessage = async ({ data }) => {
  const msg = JSON.parse(data)
  if (msg.type === 'offer') {
    await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp })
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }))
    s.textContent = 'answer sent — waiting for ICE...'
  } else if (msg.type === 'ice' && msg.candidate) {
    await pc.addIceCandidate(msg.candidate)
  }
}
pc.onicecandidate = ({ candidate }) => {
  if (candidate) ws.send(JSON.stringify({ type: 'ice', candidate }))
}
pc.oniceconnectionstatechange = () => {
  if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
    s.textContent = '❌ ICE failed — is Tailscale running on both devices?'
    s.style.color = '#f00'
  }
}
pc.ontrack = ({ streams }) => {
  document.getElementById('v').srcObject = streams[0]
  s.textContent = '✅ streaming'
}
setTimeout(() => {
  if (!document.getElementById('v').srcObject) {
    s.textContent = '❌ Timed out — check Tailscale + extension'
    s.style.color = '#f00'
  }
}, 15000)
</script></body></html>`

wss.on('connection', (ws, req) => {
  if (!req.url?.startsWith('/ws/')) return ws.close()

  ws.on('message', (raw) => {
    const text = raw.toString()
    const msg = JSON.parse(text)

    if (msg.type === 'role') {
      if (msg.role === 'host') {
        host = ws
        console.log('Host (extension) connected')
        if (bufferedOffer && viewer?.readyState === WebSocket.OPEN) viewer.send(bufferedOffer)
      } else {
        viewer = ws
        console.log('Viewer (browser) connected')
        if (bufferedOffer) viewer.send(bufferedOffer)
      }
      return
    }

    if (msg.type === 'offer') {
      bufferedOffer = text
      console.log('Offer received from host')
      if (viewer?.readyState === WebSocket.OPEN) viewer.send(text)
      return
    }

    if (msg.type === 'answer') {
      console.log('Answer received from viewer')
    }

    // Relay to other side (answer, ice)
    const other = ws === host ? viewer : host
    if (other?.readyState === WebSocket.OPEN) other.send(text)
  })
})

http.on('request', (req, res) => {
  if (req.url === `/${TOKEN}`) {
    const wsUrl = `ws://${TAILSCALE_IP}:${(http.address() as { port: number }).port}/ws/${TOKEN}`
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(viewerHtml(wsUrl))
  } else if (req.url === '/debug' && req.method === 'POST') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => { console.log('[ext-debug]', body); res.writeHead(200); res.end() })
  } else {
    res.writeHead(404); res.end()
  }
})

// ---- Fixed debug server on port 9224 ----
const debugHttp = createServer()
debugHttp.on('request', (req, res) => {
  if (req.method === 'POST') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => { console.log('[ext-debug]', body); res.writeHead(200); res.end('ok') })
  } else { res.writeHead(404); res.end() }
})
await new Promise<void>(res => debugHttp.listen(9224, '127.0.0.1', res))
console.log('[debug server] listening on 127.0.0.1:9224')

await new Promise<void>(res => http.listen(0, '0.0.0.0', res))
const port = (http.address() as { port: number }).port
const signalingUrl = `ws://${TAILSCALE_IP}:${port}/ws/${TOKEN}`
const viewerUrl = `http://${TAILSCALE_IP}:${port}/${TOKEN}`

console.log(`\nViewer URL: ${viewerUrl}`)
console.log(`Signaling:  ${signalingUrl}\n`)

// ---- Connect to chrome-tool daemon + trigger handoff_start ----
const daemonWs = new WebSocket('ws://127.0.0.1:9222/client')
await new Promise<void>((res, rej) => { daemonWs.once('open', res); daemonWs.once('error', rej) })

// Use a known session — get first active session or open a new one
const SESSION_ID = process.env.SESSION_ID ?? 'poc-webrtc-' + TOKEN

// Join/create session
daemonWs.send(JSON.stringify({ type: 'join', session_id: SESSION_ID }))

// Wait for tab_ready
await new Promise<void>((res) => {
  daemonWs.on('message', (raw) => {
    const msg = JSON.parse(raw.toString())
    if (msg.type === 'ready') res()
  })
})

console.log('Chrome session ready — navigating to example.com')
daemonWs.send(JSON.stringify({ type: 'command', session_id: SESSION_ID, id: 1, method: 'Page.navigate', params: { url: 'https://example.com' } }))
await new Promise(r => setTimeout(r, 1500))

// Log ALL messages from daemon after handoff_start
daemonWs.on('message', (raw) => {
  const msg = JSON.parse(raw.toString())
  console.log('[poc←daemon]', JSON.stringify(msg))
})

// Send handoff_start directly (Task 2 will route this properly via DaemonClient)
daemonWs.send(JSON.stringify({ type: 'handoff_start', session_id: SESSION_ID, signaling_url: signalingUrl, token: TOKEN }))
console.log('handoff_start sent — open viewer URL on phone/browser\n')
console.log('PASS: video element shows tab content with non-zero videoWidth')
console.log('Press Ctrl+C to stop\n')

// Keep alive
await new Promise<never>(() => {})
