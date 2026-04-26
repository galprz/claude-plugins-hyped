import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createIsolatedWorkspace } from './workspace.ts';

let tmpPluginRoot: string;

beforeEach(() => {
  tmpPluginRoot = mkdtempSync(join(tmpdir(), 'plugin-root-'));
});

afterEach(() => {
  rmSync(tmpPluginRoot, { recursive: true, force: true });
});

describe('createIsolatedWorkspace', () => {
  test('creates correct directory structure', async () => {
    const path = await createIsolatedWorkspace(
      'abc123', 'HN Summary', 'every 1d', [], '', tmpPluginRoot
    );
    expect(existsSync(join(path, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(path, '.mcp.json'))).toBe(true);
    expect(existsSync(join(path, '.claude', 'settings.local.json'))).toBe(true);
    expect(existsSync(join(path, '.claude', 'skills', 'job-context', 'SKILL.md'))).toBe(true);
  });

  test('CLAUDE.md contains job name and instructions', async () => {
    const path = await createIsolatedWorkspace(
      'id1', 'Morning Brief', '0 9 * * *', [], 'Focus on AI news', tmpPluginRoot
    );
    const content = readFileSync(join(path, 'CLAUDE.md'), 'utf8');
    expect(content).toContain('Morning Brief');
    expect(content).toContain('Focus on AI news');
    expect(content).toContain('[SILENT]');
  });

  test('SKILL.md has correct YAML frontmatter', async () => {
    const path = await createIsolatedWorkspace(
      'id2', 'Test Job', 'every 1h', [], 'Do X', tmpPluginRoot
    );
    const skill = readFileSync(join(path, '.claude', 'skills', 'job-context', 'SKILL.md'), 'utf8');
    expect(skill).toContain('name: job-context');
    expect(skill).toContain('description: Use when');
    expect(skill).toContain('Do X');
  });

  test('settings.local.json enables auto-approve', async () => {
    const path = await createIsolatedWorkspace('id3', 'J', 'every 1h', [], '', tmpPluginRoot);
    const settings = JSON.parse(readFileSync(join(path, '.claude', 'settings.local.json'), 'utf8'));
    expect(settings.permissions.defaultMode).toBe('bypassPermissions');
    expect(settings.permissions.allow).toContain('*');
  });

  test('mcp.json only contains requested tools', async () => {
    const path = await createIsolatedWorkspace(
      'id4', 'J', 'every 1h', ['user-browser'], '', tmpPluginRoot
    );
    const mcp = JSON.parse(readFileSync(join(path, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers)).toEqual(['user-browser']);
    expect(mcp.mcpServers['local-tts']).toBeUndefined();
  });

  test('mcp.json uses absolute plugin root paths', async () => {
    const path = await createIsolatedWorkspace(
      'id5', 'J', 'every 1h', ['user-browser'], '', tmpPluginRoot
    );
    const mcp = JSON.parse(readFileSync(join(path, '.mcp.json'), 'utf8'));
    const args = mcp.mcpServers['user-browser'].args as string[];
    expect(args.some((a: string) => a.includes(tmpPluginRoot))).toBe(true);
    // No ${CLAUDE_PLUGIN_ROOT} variable — must be resolved absolute path
    expect(JSON.stringify(mcp)).not.toContain('${CLAUDE_PLUGIN_ROOT}');
  });

  test('empty tools list writes empty mcp.json', async () => {
    const path = await createIsolatedWorkspace('id6', 'J', 'every 1h', [], '', tmpPluginRoot);
    const mcp = JSON.parse(readFileSync(join(path, '.mcp.json'), 'utf8'));
    expect(Object.keys(mcp.mcpServers)).toHaveLength(0);
  });

  test('creates agent files when agents provided', async () => {
    const path = await createIsolatedWorkspace(
      'id7', 'J', 'every 1h', [], '',
      tmpPluginRoot,
      [{ name: 'researcher', instructions: 'You are a research specialist.' }]
    );
    const agentPath = join(path, '.claude', 'agents', 'researcher.md');
    expect(existsSync(agentPath)).toBe(true);
    const content = readFileSync(agentPath, 'utf8');
    expect(content).toContain('name: researcher');
    expect(content).toContain('model: inherit');
    expect(content).toContain('You are a research specialist.');
  });

  test('no agent dir created when no agents', async () => {
    const path = await createIsolatedWorkspace('id8', 'J', 'every 1h', [], '', tmpPluginRoot);
    expect(existsSync(join(path, '.claude', 'agents'))).toBe(false);
  });

  test('workspace path is under ~/.hyped/cron/jobs/{id}', async () => {
    const path = await createIsolatedWorkspace('myid', 'J', 'every 1h', [], '', tmpPluginRoot);
    expect(path).toContain(join('.hyped', 'cron', 'jobs', 'myid'));
  });
});
