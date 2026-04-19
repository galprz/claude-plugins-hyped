import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { handleCronRun } from './tools.ts';

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
