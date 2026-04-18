import { mkdirSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export interface AgentDef {
  name: string;
  instructions: string;
}

const MCP_CONFIGS: Record<string, (pluginRoot: string) => object> = {
  'chrome-tool': (pluginRoot) => ({
    command: 'bun',
    args: ['run', '--cwd', join(pluginRoot, 'mcp', 'chrome-tool'), '--silent', 'start'],
    env: { CHROME_TOOL_PORT: '9222' },
  }),
  'local-tts': (pluginRoot) => ({
    command: 'uv',
    args: ['run', '--project', join(pluginRoot, 'mcp', 'local-tts'), 'qwen-tts-mcp'],
  }),
};

function scheduleDisplay(schedule: string): string {
  if (schedule.startsWith('every ')) return schedule;
  if (schedule.startsWith('in '))    return `once ${schedule}`;
  if (schedule.includes('*'))        return `cron: ${schedule}`;
  return schedule;
}

export async function createIsolatedWorkspace(
  jobId: string,
  jobName: string,
  schedule: string,
  tools: string[],
  instructions: string,
  pluginRoot: string,
  agents: AgentDef[] = [],
): Promise<string> {
  const workspacePath = join(homedir(), '.hyped', 'cron', 'jobs', jobId);

  // Create directory structure
  mkdirSync(join(workspacePath, '.claude', 'skills', 'job-context'), { recursive: true });
  if (agents.length > 0) {
    mkdirSync(join(workspacePath, '.claude', 'agents'), { recursive: true });
  }

  // CLAUDE.md — job context, loaded every session
  const claudeMd = `# Cron Job: ${jobName}

You are running as a scheduled cron job. No conversation history is available.

**Schedule:** ${scheduleDisplay(schedule)}
**Created:** ${new Date().toISOString()}

## Instructions

${instructions || 'No standing instructions.'}

## Output

Deliver your response directly — it will be sent to the user automatically.
If there is genuinely nothing to report, respond with exactly \`[SILENT]\`.
`.trim();

  writeFileSync(join(workspacePath, 'CLAUDE.md'), claudeMd);

  // .claude/skills/job-context/SKILL.md
  const skillMd = `---
name: job-context
description: Use when running this scheduled job to recall its purpose and standing instructions
---

# Job Context: ${jobName}

## Purpose
${jobName}

## Standing Instructions
${instructions || 'None specified.'}

## Output Format
- Deliver response directly — it will be sent to the user automatically
- If nothing to report, respond with exactly [SILENT]
`.trim();

  writeFileSync(join(workspacePath, '.claude', 'skills', 'job-context', 'SKILL.md'), skillMd);

  // .claude/settings.local.json — auto-approve so job doesn't block waiting for permission
  const settings = {
    permissions: {
      allow: ['*'],
      defaultMode: 'bypassPermissions',
    },
  };
  writeFileSync(
    join(workspacePath, '.claude', 'settings.local.json'),
    JSON.stringify(settings, null, 2),
  );

  // .mcp.json — only the tools this job needs, absolute paths
  const mcpServers: Record<string, object> = {};
  for (const tool of tools) {
    const builder = MCP_CONFIGS[tool];
    if (builder) {
      mcpServers[tool] = builder(pluginRoot);
    }
  }
  writeFileSync(
    join(workspacePath, '.mcp.json'),
    JSON.stringify({ mcpServers }, null, 2),
  );

  // .claude/agents/{name}.md — optional sub-agents
  for (const agent of agents) {
    const agentMd = `---
name: ${agent.name}
description: Use this agent when the task requires specialized ${agent.name} capabilities
model: inherit
---

${agent.instructions}
`.trim();
    writeFileSync(join(workspacePath, '.claude', 'agents', `${agent.name}.md`), agentMd);
  }

  return workspacePath;
}
