/**
 * E2E test for browser_handoff
 * Run from: /Users/galperetz/.hyped/plugins/claude-plugins-hyped/mcp/user-browser
 */
import { WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import { DaemonClient } from './client'
import { startHandoff } from './handoff'

const PORT = 9222
const SESSION_ID = randomUUID()

async function main() {
  console.log('Connecting to daemon...')
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/client`)
  await new Promise<void>((res, rej) => { ws.once('open', res); ws.once('error', rej) })

  const client = new DaemonClient(ws, SESSION_ID)
  client.join()

  console.log('Waiting for Chrome session...')
  await Promise.race([
    client.ready,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Timeout')), 15000))
  ])
  console.log('Chrome ready!')

  // Navigate to a simple page first
  await client.sendCommand('Page.navigate', { url: 'https://example.com' })
  await new Promise(r => setTimeout(r, 1500))
  console.log('Navigated to example.com')

  console.log('\nStarting handoff...')
  const url = await startHandoff(client, 'This is a test handoff. Tap around, then tap "Give AI Control" to return.')
  console.log('\n✅ Handoff URL:', url)
  console.log('\nOpen this URL on your Android to see the live Chrome view.')
  console.log('Tap "Give AI Control" to complete the test.\n')

  // Wait for the handoff to complete (the server closes when done)
  await new Promise(r => setTimeout(r, 120000))
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
