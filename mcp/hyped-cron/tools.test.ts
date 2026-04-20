import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { handleCronCreate, handleCronRun } from './tools.ts';

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
  let savedWorkingDir: string | undefined;

  beforeEach(() => {
    savedChatId = process.env.HYPED_CHAT_ID;
    savedWorkingDir = process.env.HYPED_WORKING_DIR;
    delete process.env.HYPED_CHAT_ID;
    delete process.env.HYPED_WORKING_DIR;
  });

  afterEach(() => {
    if (savedChatId !== undefined) process.env.HYPED_CHAT_ID = savedChatId;
    if (savedWorkingDir !== undefined) process.env.HYPED_WORKING_DIR = savedWorkingDir;
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
