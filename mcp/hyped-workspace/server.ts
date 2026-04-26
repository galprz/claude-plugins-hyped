import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { handleWorkspaceSet } from './tools.ts';

const TOOLS = [
  {
    name: 'workspace_set',
    description:
      'Create a git worktree for a new task and rename the Telegram group to reflect it. ' +
      'Call this before starting implementation on a new feature. ' +
      'Returns the worktree path and branch name to use going forward.',
    inputSchema: {
      type: 'object',
      required: ['name', 'chat_id'],
      properties: {
        name: {
          type: 'string',
          description: 'Short kebab-case task name (e.g. "auth-system", "fix-login"). Lowercase, hyphens only.',
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
      case 'workspace_set':
        result = await handleWorkspaceSet({ name: a.name, chat_id: a.chat_id });
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
