import { describe, test, expect } from 'bun:test';
import { handleSetGroupName } from './tools';

describe('handleSetGroupName', () => {
  test('rejects when daemon is unreachable', async () => {
    await expect(handleSetGroupName({ name: 'My Project', chat_id: -100 }))
      .rejects.toThrow();
  });
});
