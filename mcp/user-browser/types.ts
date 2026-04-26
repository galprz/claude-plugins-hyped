// Messages: MCP client → daemon
export type ClientToDaemon =
  | { type: 'join';    session_id: string }
  | { type: 'focus';   session_id: string }
  | { type: 'command'; session_id: string; id: number; method: string; params: Record<string, unknown> }
  | { type: 'leave';   session_id: string }

// Messages: daemon → MCP client
export type DaemonToClient =
  | { type: 'ready' }
  | { type: 'response'; id: number; result: unknown }
  | { type: 'event';    method: string; params: Record<string, unknown> }
  | { type: 'error';    message: string }

// Messages: extension → daemon
export type ExtToDaemon =
  | { type: 'hello' }
  | { type: 'tab_ready';  session_id: string; tab_id: number }
  | { type: 'response';   session_id: string; id: number; result: unknown }
  | { type: 'event';      session_id: string; method: string; params: Record<string, unknown> }

// Messages: daemon → extension
export type DaemonToExt =
  | { type: 'open_tab';   session_id: string }
  | { type: 'close_tab';  session_id: string }
  | { type: 'focus_tab';  session_id: string }
  | { type: 'command';    session_id: string; id: number; method: string; params: Record<string, unknown> }

// Interface used by tools.ts — decouples tools from DaemonClient implementation
export interface BrowserClient {
  sendCommand(method: string, params?: Record<string, unknown>): Promise<unknown>
  onEvent(method: string, handler: (params: Record<string, unknown>) => void): () => void
}
