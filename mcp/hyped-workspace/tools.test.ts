import { describe, test, expect } from 'bun:test';
import { handleWorkspaceSet } from './tools';

describe('handleWorkspaceSet — validation', () => {
  test('rejects name with spaces', async () => {
    await expect(handleWorkspaceSet({ name: 'auth system', chat_id: -100 }))
      .rejects.toThrow('invalid_name');
  });
  test('rejects uppercase', async () => {
    await expect(handleWorkspaceSet({ name: 'AuthSystem', chat_id: -100 }))
      .rejects.toThrow('invalid_name');
  });
  test('rejects leading hyphen', async () => {
    await expect(handleWorkspaceSet({ name: '-auth', chat_id: -100 }))
      .rejects.toThrow('invalid_name');
  });
  test('accepts valid kebab-case', async () => {
    // Will fail at daemon call — that's fine, validation passes
    await expect(handleWorkspaceSet({ name: 'auth-system', chat_id: -100 }))
      .rejects.not.toThrow('invalid_name');
  });
});
