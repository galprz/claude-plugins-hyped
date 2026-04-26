import { WebSocket } from 'ws'
import { createConnection } from 'net'
import { spawn } from 'child_process'
import { resolve } from 'path'
import { randomUUID } from 'crypto'
import type { ClientToDaemon, DaemonToClient, BrowserClient } from './types'
import type { ChromeProfile } from './profiles'

const PORT = parseInt(process.env.CHROME_TOOL_PORT ?? '9222')
const DAEMON_PATH = resolve(__dirname, 'daemon.js')

export async function portIsOpen(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection(port, '127.0.0.1')
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => resolve(false))
    setTimeout(() => { socket.destroy(); resolve(false) }, 1000)
  })
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await portIsOpen(port)) return
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error(`Daemon did not start within ${timeoutMs}ms`)
}

export async function ensureDaemon(): Promise<void> {
  if (await portIsOpen(PORT)) return
  const daemon = spawn(process.execPath, [DAEMON_PATH], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  daemon.unref()
  await waitForPort(PORT, 20000)
}

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
}

export class DaemonClient implements BrowserClient {
  private pending = new Map<number, Pending>()
  private eventListeners = new Map<string, Array<(p: Record<string, unknown>) => void>>()
  private nextId = 1
  readonly sessionId: string
  private ws: WebSocket
  private readyResolve!: () => void
  private readyReject!: (e: Error) => void
  readonly ready: Promise<void>

  constructor(ws: WebSocket, sessionId = randomUUID()) {
    this.ws = ws
    this.sessionId = sessionId
    this.ready = new Promise((res, rej) => {
      this.readyResolve = res
      this.readyReject = rej
    })
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as DaemonToClient
      if (msg.type === 'ready') { this.readyResolve(); return }
      if (msg.type === 'response') {
        const p = this.pending.get(msg.id)
        if (p) { this.pending.delete(msg.id); p.resolve(msg.result) }
        return
      }
      if (msg.type === 'event') {
        for (const h of this.eventListeners.get(msg.method) ?? []) h(msg.params)
        return
      }
      if (msg.type === 'error') {
        for (const [, p] of this.pending) p.reject(new Error(msg.message))
        this.pending.clear()
        this.readyReject(new Error(msg.message))
      }
    })
  }

  join(): void {
    this.ws.send(JSON.stringify({ type: 'join', session_id: this.sessionId } satisfies ClientToDaemon))
  }

  leave(): void {
    this.ws.send(JSON.stringify({ type: 'leave', session_id: this.sessionId } satisfies ClientToDaemon))
  }

  focus(): void {
    this.ws.send(JSON.stringify({ type: 'focus', session_id: this.sessionId } satisfies ClientToDaemon))
  }

  async sendCommand(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++
    const msg: ClientToDaemon = { type: 'command', session_id: this.sessionId, id, method, params }
    this.ws.send(JSON.stringify(msg))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  onEvent(method: string, handler: (params: Record<string, unknown>) => void): () => void {
    const list = this.eventListeners.get(method) ?? []
    list.push(handler)
    this.eventListeners.set(method, list)
    return () => {
      const updated = (this.eventListeners.get(method) ?? []).filter(h => h !== handler)
      this.eventListeners.set(method, updated)
    }
  }

  async openBrowser(profile?: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onMessage = (raw: import('ws').RawData) => {
        const msg = JSON.parse(raw.toString()) as DaemonToClient
        if (msg.type === 'browser_opened') {
          this.ws.off('message', onMessage)
          resolve()
        } else if (msg.type === 'error') {
          this.ws.off('message', onMessage)
          reject(new Error(msg.message))
        }
      }
      this.ws.on('message', onMessage)
      this.ws.send(JSON.stringify({ type: 'open_browser', profile } satisfies ClientToDaemon))
    })
  }

  async closeBrowser(): Promise<void> {
    return new Promise<void>((resolve) => {
      const onMessage = (raw: import('ws').RawData) => {
        const msg = JSON.parse(raw.toString()) as DaemonToClient
        if (msg.type === 'browser_closed' || msg.type === 'error') {
          this.ws.off('message', onMessage)
          resolve()
        }
      }
      this.ws.on('message', onMessage)
      this.ws.send(JSON.stringify({ type: 'close_browser' } satisfies ClientToDaemon))
    })
  }

  async listProfiles(): Promise<ChromeProfile[]> {
    return new Promise<ChromeProfile[]>((resolve) => {
      const onMessage = (raw: import('ws').RawData) => {
        const msg = JSON.parse(raw.toString()) as DaemonToClient
        if (msg.type === 'profiles') {
          this.ws.off('message', onMessage)
          resolve(msg.profiles)
        }
      }
      this.ws.on('message', onMessage)
      this.ws.send(JSON.stringify({ type: 'list_profiles' } satisfies ClientToDaemon))
    })
  }
}
