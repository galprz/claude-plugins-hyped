import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { existsSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { handleCronCreate, handleCronRun } from './tools.ts';
import { loadJobs, saveJobs } from './jobs.ts';

describe('jobs global path', () => {
  test('saveJobs creates file at ~/.hyped/cron/jobs.json', async () => {
    const { saveJobs } = await import('./jobs.ts');
    saveJobs([]);
    expect(existsSync(join(homedir(), '.hyped', 'cron', 'jobs.json'))).toBe(true);
  });

  test('loadJobs returns array (does not throw)', async () => {
    const { loadJobs } = await import('./jobs.ts');
    const result = loadJobs();
    expect(Array.isArray(result)).toBe(true);
  });

  test('round trip: saveJobs then loadJobs', async () => {
    const { saveJobs, loadJobs } = await import('./jobs.ts');
    const before = loadJobs();
    const testJob = { id: 'test-roundtrip-xyz', name: 'Test', prompt: 'go', project_dir: null } as any;
    saveJobs([...before, testJob]);
    const after = loadJobs();
    expect(after.some((j: any) => j.id === 'test-roundtrip-xyz')).toBe(true);
    // Cleanup
    saveJobs(before);
  });
});

const mockFetch = mock(() => Promise.resolve({ ok: true, status: 200 } as Response));

describe('handleCronRun', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
    delete process.env.HYPED_DAEMON_URL;
  });

  test('POSTs to default daemon URL', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
    await handleCronRun('abc123');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:7891/api/cron/jobs/abc123/run',
      { method: 'POST' }
    );
  });

  test('uses HYPED_DAEMON_URL env var when set', async () => {
    process.env.HYPED_DAEMON_URL = 'http://localhost:9999';
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
    await handleCronRun('xyz');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9999/api/cron/jobs/xyz/run',
      { method: 'POST' }
    );
  });

  test('returns success message on 200', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 } as Response);
    const result = await handleCronRun('abc123');
    expect(result).toBe('▶️ Job "abc123" fired immediately.');
  });

  test('throws on 404', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 } as Response);
    await expect(handleCronRun('missing')).rejects.toThrow('Job "missing" not found');
  });

  test('throws on non-ok status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 } as Response);
    await expect(handleCronRun('j1')).rejects.toThrow('Daemon returned 503');
  });

  test('throws with helpful message when daemon unreachable', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(handleCronRun('j1')).rejects.toThrow('Daemon unreachable at http://localhost:7891');
  });
});

describe('handleCronCreate — timezone enforcement', () => {
  let savedChatId: string | undefined;

  beforeEach(() => {
    savedChatId = process.env.HYPED_CHAT_ID;
    delete process.env.HYPED_CHAT_ID;
  });

  afterEach(() => {
    if (savedChatId !== undefined) process.env.HYPED_CHAT_ID = savedChatId;
  });

  test('rejects time-of-day schedule without timezone', async () => {
    await expect(
      handleCronCreate({ schedule: '0 8 * * *', prompt: 'test' })
    ).rejects.toThrow('timezone_required');
  });

  test('rejects time-of-day schedule with invalid timezone', async () => {
    await expect(
      handleCronCreate({ schedule: '0 8 * * *', prompt: 'test', timezone: 'Foo/Bar' })
    ).rejects.toThrow('invalid_timezone');
  });

  test('allows interval schedule without timezone', async () => {
    // Should not throw timezone error — will fail later on missing env vars, which is fine
    await expect(
      handleCronCreate({ schedule: 'every 2h', prompt: 'test' })
    ).rejects.toThrow('HYPED_CHAT_ID');
  });
});

describe('handleCronCreate', () => {
  let origChatId: string | undefined;
  let origThreadId: string | undefined;
  let origPluginRoot: string | undefined;
  let createdJobIds: string[] = [];

  beforeEach(() => {
    origChatId = process.env.HYPED_CHAT_ID;
    origThreadId = process.env.HYPED_THREAD_ID;
    origPluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
    process.env.HYPED_CHAT_ID = '99999';
    process.env.HYPED_THREAD_ID = '';
    process.env.CLAUDE_PLUGIN_ROOT = join(homedir(), '.hyped', 'cron', 'plugin-root-test');
    createdJobIds = [];
  });

  function cleanup() {
    process.env.HYPED_CHAT_ID = origChatId;
    process.env.HYPED_THREAD_ID = origThreadId;
    process.env.CLAUDE_PLUGIN_ROOT = origPluginRoot;
    const current = loadJobs();
    const filtered = current.filter((j: any) => !createdJobIds.includes(j.id));
    saveJobs(filtered);
    for (const id of createdJobIds) {
      const wsPath = join(homedir(), '.hyped', 'cron', 'jobs', id);
      rmSync(wsPath, { recursive: true, force: true });
    }
  }

  test('saves job to global jobs file', async () => {
    const before = loadJobs().length;
    await handleCronCreate({ schedule: 'every 1h', prompt: 'cache-safe test' });
    const after = loadJobs();
    expect(after.length).toBe(before + 1);
    const job = after[after.length - 1];
    createdJobIds.push(job.id);
    cleanup();
  });

  test('project_dir is null by default', async () => {
    await handleCronCreate({ schedule: 'every 1h', prompt: 'test job no project' });
    const jobs = loadJobs();
    const job = jobs[jobs.length - 1];
    createdJobIds.push(job.id);
    expect(job.project_dir).toBeNull();
    cleanup();
  });

  test('stores project_dir when provided', async () => {
    await handleCronCreate({ schedule: 'every 1h', prompt: 'test job with project', project_dir: '/tmp/my-project' });
    const jobs = loadJobs();
    const job = jobs[jobs.length - 1];
    createdJobIds.push(job.id);
    expect(job.project_dir).toBe('/tmp/my-project');
    cleanup();
  });

  test('job has no workspace_mode field', async () => {
    await handleCronCreate({ schedule: 'every 1h', prompt: 'check no workspace_mode' });
    const jobs = loadJobs();
    const job = jobs[jobs.length - 1] as any;
    createdJobIds.push(job.id);
    expect(job.workspace_mode).toBeUndefined();
    cleanup();
  });

  test('always provisions workspace even without project_dir', async () => {
    await handleCronCreate({ schedule: 'every 1h', prompt: 'do stuff' });
    const jobs = loadJobs();
    const job = jobs[jobs.length - 1];
    createdJobIds.push(job.id);
    const wsPath = join(homedir(), '.hyped', 'cron', 'jobs', job.id);
    expect(existsSync(join(wsPath, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(wsPath, '.claude', 'settings.local.json'))).toBe(true);
    cleanup();
  });

  test('result message shows Workspace when no project_dir', async () => {
    const result = await handleCronCreate({ schedule: 'every 1h', prompt: 'workspace msg test' });
    const jobs = loadJobs();
    createdJobIds.push(jobs[jobs.length - 1].id);
    expect(result).toContain('Workspace:');
    expect(result).not.toContain('Project:');
    cleanup();
  });

  test('result message shows Project when project_dir provided', async () => {
    const result = await handleCronCreate({ schedule: 'every 1h', prompt: 'project msg test', project_dir: '/my/proj' });
    const jobs = loadJobs();
    createdJobIds.push(jobs[jobs.length - 1].id);
    expect(result).toContain('Project: /my/proj');
    cleanup();
  });
});
