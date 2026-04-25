import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { Session } from './session'
import { toolDefinitions, executeTool } from './tools'

const session = new Session()

const server = new Server(
  { name: 'incognito-browser', version: '1.0.0' },
  { capabilities: { tools: {} } }
)

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }))

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params
  return executeTool(name, args ?? {}, session)
})

const transport = new StdioServerTransport()
await server.connect(transport)

process.on('SIGINT', async () => { await session.close(); process.exit(0) })
process.on('SIGTERM', async () => { await session.close(); process.exit(0) })
