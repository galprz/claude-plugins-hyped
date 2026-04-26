import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import { ensureDaemon, DaemonClient } from './client'
import { toolDefinitions, executeTool } from './tools'

const PORT = parseInt(process.env.CHROME_TOOL_PORT ?? '9222')
const SESSION_ID = randomUUID()

let client: DaemonClient | null = null

// Tools that only need the daemon WebSocket, not a ready Chrome tab
const DAEMON_ONLY_TOOLS = new Set(['list_profiles', 'open_browser', 'close_browser'])

async function connectDaemon(): Promise<DaemonClient> {
  if (client) return client

  await ensureDaemon()

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/client`)
  await new Promise<void>((res, rej) => {
    ws.once('open', res)
    ws.once('error', rej)
  })

  client = new DaemonClient(ws, SESSION_ID)
  return client
}

async function getClient(): Promise<DaemonClient> {
  const c = await connectDaemon()

  c.join()

  await Promise.race([
    c.ready,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('Browser not ready after 20s. Call open_browser first.')), 20000)
    ),
  ])

  return c
}

const server = new Server(
  { name: 'user-browser', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params
  try {
    const c = DAEMON_ONLY_TOOLS.has(name)
      ? await connectDaemon()
      : await getClient()
    return executeTool(name, args ?? {}, c, SESSION_ID)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { content: [{ type: 'text' as const, text: `Connection error: ${msg}` }] }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)

process.on('exit', () => client?.leave())
process.on('SIGINT', () => { client?.leave(); process.exit(0) })
process.on('SIGTERM', () => { client?.leave(); process.exit(0) })
