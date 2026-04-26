import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { execSync } from 'child_process'
import { resolve } from 'path'
import { SessionRegistry } from './sessions'
import { launchChrome } from './chrome'
import { listChromeProfiles, resolveProfileDir } from './profiles'
import type { ClientToDaemon, DaemonToClient, ExtToDaemon, DaemonToExt } from './types'

const PORT = parseInt(process.env.CHROME_TOOL_PORT ?? '9222')
const EXTENSION_PATH = process.env.CHROME_TOOL_EXT ??
  resolve(__dirname, '../../extension/dist')

const sessions = new SessionRegistry()
let extensionSocket: WebSocket | null = null
let windowIdsBefore = new Set<string>()

function getChromeWindowIds(): Set<string> {
  try {
    const out = execSync(
      'osascript -e \'tell application "Google Chrome" to get id of every window\'',
      { timeout: 3000 },
    ).toString().trim()
    if (!out) return new Set()
    return new Set(out.split(',').map(s => s.trim()))
  } catch { return new Set() }
}

function closeChromeWindowById(windowId: string): void {
  try {
    execSync(
      `osascript -e 'tell application "Google Chrome" to close (every window whose id is ${windowId})'`,
      { timeout: 3000 },
    )
  } catch { /* window already closed */ }
}

function focusChromeWindowById(windowId: string): void {
  try {
    execSync(
      `osascript -e 'tell application "Google Chrome" to set index of (every window whose id is ${windowId}) to 1' -e 'activate application "Google Chrome"'`,
      { timeout: 3000 },
    )
  } catch { /* ignore */ }
}

function sendExt(msg: DaemonToExt): void {
  if (extensionSocket?.readyState === WebSocket.OPEN) {
    extensionSocket.send(JSON.stringify(msg))
  }
}

function sendClient(socket: WebSocket, msg: DaemonToClient): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg))
  }
}

function handleExtension(ws: WebSocket): void {
  extensionSocket = ws
  console.error('[daemon] extension connected')

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString()) as ExtToDaemon

    if (msg.type === 'hello') {
      console.error('[daemon] extension ready')
      return
    }

    if (msg.type === 'tab_ready') {
      const session = sessions.setTabId(msg.session_id, msg.tab_id)
      if (!session) return
      for (const cmd of session.pending) {
        sendExt({ type: 'command', session_id: msg.session_id, ...cmd })
      }
      session.pending = []
      sendClient(session.clientSocket, { type: 'ready' })
      return
    }

    if (msg.type === 'response') {
      const session = sessions.get(msg.session_id)
      if (session) {
        sendClient(session.clientSocket, { type: 'response', id: msg.id, result: msg.result })
      }
      return
    }

    if (msg.type === 'event') {
      const session = sessions.get(msg.session_id)
      if (session) {
        sendClient(session.clientSocket, { type: 'event', method: msg.method, params: msg.params })
      }
    }
  })

  ws.on('close', () => {
    extensionSocket = null
    console.error('[daemon] extension disconnected')
    for (const session of sessions.all()) {
      sendClient(session.clientSocket, { type: 'error', message: 'Browser disconnected' })
    }
  })
}

function handleClient(ws: WebSocket): void {
  let sessionId: string | null = null

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString()) as ClientToDaemon

    if (msg.type === 'join') {
      sessionId = msg.session_id
      sessions.add(sessionId, ws)
      if (extensionSocket?.readyState === WebSocket.OPEN) {
        sendExt({ type: 'open_tab', session_id: sessionId })
      } else {
        // Fallback: auto-launch with Default profile if Chrome isn't open yet
        console.error('[daemon] no extension on join — auto-launching Default profile')
        try {
          windowIdsBefore = getChromeWindowIds()
          launchChrome(EXTENSION_PATH, 'Default')
        } catch (e) {
          sendClient(ws, { type: 'error', message: `Chrome launch failed: ${(e as Error).message}` })
        }
      }
      return
    }

    if (msg.type === 'list_profiles') {
      const profiles = listChromeProfiles()
      sendClient(ws, { type: 'profiles', profiles })
      return
    }

    if (msg.type === 'open_browser') {
      const profiles = listChromeProfiles()
      let profileDir = 'Default'

      if (msg.profile) {
        const resolved = resolveProfileDir(msg.profile, profiles)
        if (!resolved) {
          const names = profiles.map(p => `"${p.name}" (${p.directory})`).join(', ')
          sendClient(ws, {
            type: 'error',
            message: `Profile "${msg.profile}" not found. Available profiles: ${names}`,
          })
          return
        }
        profileDir = resolved
      }

      try {
        windowIdsBefore = getChromeWindowIds()
        launchChrome(EXTENSION_PATH, profileDir)
        // Wait for Chrome to open the new window, then focus it
        // so the extension's open_tab creates tabs in the correct window
        await new Promise<void>(r => setTimeout(r, 1500))
        const afterIds = getChromeWindowIds()
        for (const id of afterIds) {
          if (!windowIdsBefore.has(id)) {
            focusChromeWindowById(id)
            break
          }
        }
        sendClient(ws, { type: 'browser_opened' })
      } catch (e) {
        sendClient(ws, { type: 'error', message: `Chrome launch failed: ${(e as Error).message}` })
      }
      return
    }

    if (msg.type === 'close_browser') {
      // Close only the windows we opened (new IDs since launch)
      const currentIds = getChromeWindowIds()
      for (const id of currentIds) {
        if (!windowIdsBefore.has(id)) {
          closeChromeWindowById(id)
        }
      }
      // Clean up sessions owned by this client
      for (const session of sessions.all()) {
        if (session.clientSocket === ws) {
          sendExt({ type: 'close_tab', session_id: session.sessionId })
          sessions.remove(session.sessionId)
        }
      }
      windowIdsBefore = new Set()
      sendClient(ws, { type: 'browser_closed' })
      return
    }

    if (msg.type === 'focus') {
      const session = sessions.get(msg.session_id)
      if (session) sendExt({ type: 'focus_tab', session_id: msg.session_id })
      return
    }

    if (msg.type === 'command') {
      const session = sessions.get(msg.session_id)
      if (!session) {
        sendClient(ws, { type: 'error', message: 'Session not found' })
        return
      }
      if (session.tabId === null) {
        session.pending.push({ id: msg.id, method: msg.method, params: msg.params })
      } else {
        sendExt({
          type: 'command',
          session_id: msg.session_id,
          id: msg.id,
          method: msg.method,
          params: msg.params,
        })
      }
      return
    }

    if (msg.type === 'leave' && sessionId) {
      sessions.remove(sessionId)
      sendExt({ type: 'close_tab', session_id: sessionId })
      sessionId = null
    }
  })

  ws.on('close', () => {
    if (sessionId) {
      sessions.remove(sessionId)
      sendExt({ type: 'close_tab', session_id: sessionId })
    }
  })
}

const server = createServer()
const wss = new WebSocketServer({ server })

wss.on('connection', (ws, req) => {
  const path = req.url ?? '/'
  if (path === '/extension') handleExtension(ws)
  else if (path === '/client') handleClient(ws)
  else ws.close(1008, 'Unknown path')
})

server.listen(PORT, '127.0.0.1', () => {
  console.error(`[daemon] ws://127.0.0.1:${PORT}`)
})
