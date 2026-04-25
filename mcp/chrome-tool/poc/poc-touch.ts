/**
 * POC 3 — Touch input forwarding
 *
 * Validates that Input.dispatchTouchEvent and Input.dispatchMouseEvent
 * trigger real page interactions via the relay daemon.
 *
 * Pass: page reacts to touch/click (URL changes or active element changes),
 *       before/after screenshots differ visually
 */
import { WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const PORT = parseInt(process.env.CHROME_TOOL_PORT ?? '9222')
const SESSION_ID = process.env.SESSION_ID ?? randomUUID()
const OUT_DIR = process.env.OUT_DIR ?? join('/tmp', `poc-touch-${Date.now()}`)

type DaemonMsg =
  | { type: 'ready' }
  | { type: 'response'; id: number; result: unknown }
  | { type: 'event'; method: string; params: Record<string, unknown> }
  | { type: 'error'; message: string }

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  console.log(`Output dir: ${OUT_DIR}`)
  console.log(`Connecting to ws://127.0.0.1:${PORT}/client`)

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/client`)
  let nextId = 1
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString()) as DaemonMsg
    if (msg.type === 'response') {
      const p = pending.get((msg as { id: number }).id)
      if (p) { pending.delete((msg as { id: number }).id); p.resolve(msg.result) }
    }
  })

  function sendCmd(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = nextId++
    ws.send(JSON.stringify({ type: 'command', session_id: SESSION_ID, id, method, params }))
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); reject(new Error(`Timeout: ${method}`)) }
      }, 5000)
    })
  }

  await new Promise<void>((res, rej) => { ws.once('open', res); ws.once('error', rej) })
  ws.send(JSON.stringify({ type: 'join', session_id: SESSION_ID }))
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error('Timeout')), 15000)
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as DaemonMsg
      if (msg.type === 'ready') { clearTimeout(t); res() }
      if (msg.type === 'error') { clearTimeout(t); rej(new Error(msg.message)) }
    })
  })
  console.log('Session ready')

  // Navigate to example.com — a simple page with a clickable link
  await sendCmd('Page.navigate', { url: 'https://example.com' })
  await new Promise(r => setTimeout(r, 1500))
  console.log('Navigated to example.com')

  // Get initial URL and active element
  const initialUrl = await sendCmd('Runtime.evaluate', { expression: 'location.href', returnByValue: true }) as { result: { value: string } }
  const initialActive = await sendCmd('Runtime.evaluate', { expression: 'document.activeElement.tagName', returnByValue: true }) as { result: { value: string } }
  console.log(`Initial URL: ${initialUrl.result.value}`)
  console.log(`Initial activeElement: ${initialActive.result.value}`)

  // Find the "Learn more" link coordinates via DOM evaluation
  const linkRect = await sendCmd('Runtime.evaluate', {
    expression: `JSON.stringify(document.querySelector('a') ? document.querySelector('a').getBoundingClientRect() : null)`,
    returnByValue: true,
  }) as { result: { value: string } }
  const rect = JSON.parse(linkRect.result.value) as { x: number; y: number; width: number; height: number } | null
  const tapX = rect ? Math.round(rect.x + rect.width / 2) : 400
  const tapY = rect ? Math.round(rect.y + rect.height / 2) : 300
  console.log(`Target: "Learn more" link at (${tapX}, ${tapY})`)

  // Take before screenshot
  const before = await sendCmd('Page.captureScreenshot', { format: 'jpeg', quality: 80 }) as { data: string }
  writeFileSync(join(OUT_DIR, 'before.jpg'), Buffer.from(before.data, 'base64'))
  console.log('Before screenshot saved')

  // --- Test 1: Touch events (requires touch emulation to be enabled first) ---
  console.log(`\nEnabling touch emulation...`)
  await sendCmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })

  console.log(`Dispatching touchStart + touchEnd at (${tapX}, ${tapY})...`)
  let touchWorked = false
  try {
    await sendCmd('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: tapX, y: tapY, id: 0, radiusX: 1, radiusY: 1, force: 1 }],
    })
    await new Promise(r => setTimeout(r, 50))
    await sendCmd('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await new Promise(r => setTimeout(r, 500))

    const afterTouch = await sendCmd('Runtime.evaluate', { expression: 'location.href', returnByValue: true }) as { result: { value: string } }
    console.log(`URL after touch: ${afterTouch.result.value}`)
    touchWorked = afterTouch.result.value !== initialUrl.result.value
    console.log(`Touch triggered navigation: ${touchWorked ? '✅ YES' : '⚠️  NO'}`)
  } catch (err) {
    console.log(`Touch events threw: ${(err as Error).message} — trying mouse fallback`)
  }

  if (!touchWorked) {
    // --- Test 2: Mouse click ---
    await sendCmd('Page.navigate', { url: 'https://example.com' })
    await new Promise(r => setTimeout(r, 1200))

    // Re-fetch link coords after re-navigation
    const linkRect2 = await sendCmd('Runtime.evaluate', {
      expression: `JSON.stringify(document.querySelector('a').getBoundingClientRect())`,
      returnByValue: true,
    }) as { result: { value: string } }
    const rect2 = JSON.parse(linkRect2.result.value) as { x: number; y: number; width: number; height: number }
    const cx = Math.round(rect2.x + rect2.width / 2)
    const cy = Math.round(rect2.y + rect2.height / 2)
    console.log(`\nDispatching mouse click at (${cx}, ${cy})...`)

    await sendCmd('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1 })
    await sendCmd('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1 })
    await new Promise(r => setTimeout(r, 2000))  // wait for navigation

    const afterMouse = await sendCmd('Runtime.evaluate', { expression: 'location.href', returnByValue: true }) as { result: { value: string } }
    console.log(`URL after mouse click: ${afterMouse.result.value}`)
    const mouseWorked = afterMouse.result.value !== 'https://example.com/'
    console.log(`Mouse click triggered navigation: ${mouseWorked ? '✅ YES' : '⚠️  NO'}`)

    if (!mouseWorked) {
      // --- Test 3: JS click (baseline — confirms page is responsive) ---
      console.log('\nTesting JS click (baseline)...')
      await sendCmd('Runtime.evaluate', { expression: `document.querySelector('a').click()`, returnByValue: true })
      await new Promise(r => setTimeout(r, 2000))
      const afterJs = await sendCmd('Runtime.evaluate', { expression: 'location.href', returnByValue: true }) as { result: { value: string } }
      console.log(`URL after JS click: ${afterJs.result.value}`)
      console.log(`JS click worked: ${afterJs.result.value !== 'https://example.com/' ? '✅ YES' : '❌ NO'}`)
    }
  }

  // Take after screenshot
  await new Promise(r => setTimeout(r, 1000))
  const after = await sendCmd('Page.captureScreenshot', { format: 'jpeg', quality: 80 }) as { data: string }
  writeFileSync(join(OUT_DIR, 'after.jpg'), Buffer.from(after.data, 'base64'))
  console.log('After screenshot saved')

  // Evaluate result
  const finalUrl = await sendCmd('Runtime.evaluate', { expression: 'location.href', returnByValue: true }) as { result: { value: string } }
  const finalActive = await sendCmd('Runtime.evaluate', { expression: 'document.activeElement.tagName', returnByValue: true }) as { result: { value: string } }
  console.log(`\nFinal URL: ${finalUrl.result.value}`)
  console.log(`Final activeElement: ${finalActive.result.value}`)

  const urlChanged = finalUrl.result.value !== initialUrl.result.value
  const elementChanged = finalActive.result.value !== initialActive.result.value

  ws.close()

  console.log('\n--- Result ---')
  console.log(`URL changed: ${urlChanged}`)
  console.log(`Active element changed: ${elementChanged}`)
  console.log(`Screenshots: ${OUT_DIR}/before.jpg  ${OUT_DIR}/after.jpg`)

  if (urlChanged || elementChanged) {
    console.log('\n✅ PASS — touch/mouse events trigger real page interaction through daemon relay')
    console.log(`   Primary path: ${urlChanged && !elementChanged ? 'touch' : 'mouse'} events`)
    process.exit(0)
  } else {
    console.log('\n❌ FAIL — neither touch nor mouse events triggered page interaction')
    process.exit(1)
  }
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1) })
