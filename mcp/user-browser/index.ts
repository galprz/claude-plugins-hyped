import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { WebSocket } from 'ws'
import { randomUUID } from 'crypto'
import { ensureDaemon, DaemonClient } from './client'
import { toolDefinitions, executeTool } from './tools'

const PORT = parseInt(process.env.CHROME_TOOL_PORT ?? '9222')
const SESSION_ID = randomUUID()

async function main() {
  await ensureDaemon()

  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/client`)
  await new Promise<void>((res, rej) => {
    ws.once('open', res)
    ws.once('error', rej)
  })

  const client = new DaemonClient(ws, SESSION_ID)
  client.join()

  await Promise.race([
    client.ready,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('Browser not ready after 20s')), 20000)
    ),
  ])

  const server = new Server(
    { name: 'user-browser', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params
    return executeTool(name, args ?? {}, client, SESSION_ID)
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)

  process.on('exit', () => client.leave())
  process.on('SIGINT', () => { client.leave(); process.exit(0) })
  process.on('SIGTERM', () => { client.leave(); process.exit(0) })
}

main().catch(err => { console.error(err); process.exit(1) })
