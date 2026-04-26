import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  handleCronCreate,
  handleCronList,
  handleCronPause,
  handleCronRemove,
  handleCronResume,
  handleCronRun,
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
        workspace_mode: {
          type: 'string',
          enum: ['project', 'isolated'],
          description: '"project" = runs in current project dir (default). "isolated" = gets its own clean workspace at ~/.hyped/cron/jobs/{id}/ with its own CLAUDE.md, skills, and MCP tools.',
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: 'MCP tools for isolated workspace: "user-browser" (browse web), "local-tts" (audio). Only relevant for isolated mode.',
        },
        instructions: {
          type: 'string',
          description: 'Standing instructions written into workspace CLAUDE.md and skill file. E.g. "Focus on AI news, skip politics". Only for isolated mode.',
        },
        agents: {
          type: 'array',
          description: 'Optional sub-agents to scaffold in .claude/agents/. Only for isolated mode.',
          items: {
            type: 'object',
            required: ['name', 'instructions'],
            properties: {
              name: { type: 'string', description: 'Agent name e.g. "researcher"' },
              instructions: { type: 'string', description: 'Full agent system prompt' },
            },
          },
        },
        is_heartbeat: {
          type: 'boolean',
          description: 'Mark as heartbeat job — shows 🫀 header in Telegram instead of ⏰ cron. Use for autonomous monitoring jobs that self-terminate via cron_remove.',
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
  {
    name: 'cron_run',
    description: 'Immediately fire a cron job by ID (for testing). Calls the daemon directly — no scheduler delay.',
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
  const a = args as Record<string, any>;
  try {
    let result: string;
    switch (name) {
      case 'cron_create':
        result = await handleCronCreate({
          schedule: a.schedule,
          prompt: a.prompt,
          name: a.name,
          timezone: a.timezone,
          workspace_mode: a.workspace_mode,
          tools: a.tools,
          instructions: a.instructions,
          agents: a.agents,
          is_heartbeat: a.is_heartbeat,
        });
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
      case 'cron_run':
        result = await handleCronRun(a.id);
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
