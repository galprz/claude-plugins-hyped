import type { WebSocket } from 'ws'

export interface Session {
  sessionId: string
  tabId: number | null
  clientSocket: WebSocket
  pending: Array<{ id: number; method: string; params: Record<string, unknown> }>
}

export class SessionRegistry {
  private sessions = new Map<string, Session>()

  add(sessionId: string, clientSocket: WebSocket): void {
    this.sessions.set(sessionId, { sessionId, tabId: null, clientSocket, pending: [] })
  }

  get(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)
  }

  setTabId(sessionId: string, tabId: number): Session | undefined {
    const session = this.sessions.get(sessionId)
    if (!session) return undefined
    session.tabId = tabId
    return session
  }

  remove(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId)
    this.sessions.delete(sessionId)
    return session
  }

  getByTabId(tabId: number): Session | undefined {
    for (const session of this.sessions.values()) {
      if (session.tabId === tabId) return session
    }
    return undefined
  }

  all(): Session[] {
    return Array.from(this.sessions.values())
  }
}
