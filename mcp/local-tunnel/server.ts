import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { TunnelManager } from './tunnel.ts'

const manager = new TunnelManager()

const TOOLS = [
  {
    name: 'tunnel_open',
    description: 'Open an ngrok tunnel to a local URL. Returns a copy-paste URL with Basic Auth embedded (https://hyped:<token>@<host>).',
    inputSchema: {
      type: 'object',
      required: ['local_url'],
      properties: {
        local_url: { type: 'string', description: 'Local URL to expose, e.g. "http://localhost:3000"' },
        name: { type: 'string', description: 'Optional display label for tunnel_list' },
      },
    },
  },
  {
    name: 'tunnel_close',
    description: 'Close an open tunnel by ID.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'Tunnel ID from tunnel_open response' } },
    },
  },
  {
    name: 'tunnel_list',
    description: 'List all tunnels open in this Claude session.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'tunnel_status',
    description: 'Get status of a specific tunnel by ID.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'Tunnel ID from tunnel_open response' } },
    },
  },
]

const server = new Server(
  { name: 'local-tunnel', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))

server.setRequestHandler(CallToolRequestSchema, async req => {
  const { name, arguments: args = {} } = req.params
  const a = args as Record<string, unknown>
  try {
    let result: unknown
    switch (name) {
      case 'tunnel_open':   result = await manager.open(a.local_url as string, a.name as string | undefined); break
      case 'tunnel_close':  result = await manager.close(a.id as string); break
      case 'tunnel_list':   result = manager.list(); break
      case 'tunnel_status': result = manager.status(a.id as string); break
      default: throw new Error(`Unknown tool: ${name}`)
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (e: unknown) {
    return { content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }], isError: true }
  }
})

const transport = new StdioServerTransport()
await server.connect(transport)
