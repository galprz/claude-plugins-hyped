import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { handleSetGroupName } from './tools.ts';

const TOOLS = [
  {
    name: 'set_group_name',
    description:
      'Set the Telegram group name/title. ' +
      'Use this to rename the current Telegram group to reflect the active task or project.',
    inputSchema: {
      type: 'object',
      required: ['name', 'chat_id'],
      properties: {
        name: {
          type: 'string',
          description: 'The new group name/title.',
        },
        chat_id: {
          type: 'number',
          description: 'Telegram chat ID for this conversation (negative for groups). Found in your system prompt.',
        },
      },
    },
  },
];

const server = new Server(
  { name: 'hyped-workspace', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async req => {
  const { name, arguments: args = {} } = req.params;
  const a = args as Record<string, any>;
  try {
    let result: string;
    switch (name) {
      case 'set_group_name':
        result = await handleSetGroupName({ name: a.name, chat_id: a.chat_id });
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: result }] };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { content: [{ type: 'text', text: msg }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
