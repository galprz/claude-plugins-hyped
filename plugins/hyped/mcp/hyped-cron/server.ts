import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  handleCronCreate,
  handleCronList,
  handleCronPause,
  handleCronRemove,
  handleCronResume,
} from './tools.ts';

const TOOLS = [
  {
    name: 'cron_create',
    description:
      'Schedule a recurring task. Pass schedule + prompt only — chat and project context are injected automatically. Do NOT pass chat_id or working_dir.',
    inputSchema: {
      type: 'object',
      required: ['schedule', 'prompt'],
      properties: {
        schedule: {
          type: 'string',
          description: 'Schedule format: "every 2h", "every 30m", "0 9 * * *" (cron), "in 30m" (one-shot)',
        },
        prompt: {
          type: 'string',
          description: 'Self-contained prompt sent to a fresh Claude session. No conversation history is available.',
        },
        name: {
          type: 'string',
          description: 'Optional short display name for the job',
        },
        timezone: {
          type: 'string',
          description: 'Optional IANA timezone e.g. "America/New_York". Use when user specifies a local time.',
        },
      },
    },
  },
  {
    name: 'cron_list',
    description: 'List all cron jobs for the current chat',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'cron_pause',
    description: 'Pause a cron job by its ID',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'Job ID (from cron_list)' } },
    },
  },
  {
    name: 'cron_resume',
    description: 'Resume a paused or disabled cron job by its ID',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'Job ID (from cron_list)' } },
    },
  },
  {
    name: 'cron_remove',
    description: 'Delete a cron job by its ID',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'Job ID (from cron_list)' } },
    },
  },
];

const server = new Server(
  { name: 'hyped-cron', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async req => {
  const { name, arguments: args = {} } = req.params;
  const a = args as Record<string, string>;
  try {
    let result: string;
    switch (name) {
      case 'cron_create':
        result = await handleCronCreate({ schedule: a.schedule, prompt: a.prompt, name: a.name, timezone: a.timezone });
        break;
      case 'cron_list':
        result = await handleCronList();
        break;
      case 'cron_pause':
        result = await handleCronPause(a.id);
        break;
      case 'cron_resume':
        result = await handleCronResume(a.id);
        break;
      case 'cron_remove':
        result = await handleCronRemove(a.id);
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
