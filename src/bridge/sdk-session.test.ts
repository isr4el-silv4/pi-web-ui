import { describe, expect, it, vi } from 'vitest';
import { createSdkSessionHost } from './sdk-session.js';

describe('sdk session host placeholder', () => {
  it('creates sessions through an injected SDK adapter', async () => {
    const adapter = { createSession: vi.fn(async (options) => ({ id: 'sdk-1', ...options })) };
    const host = createSdkSessionHost(adapter);
    await expect(host.create({ cwd: '/project' })).resolves.toMatchObject({ id: 'sdk-1', cwd: '/project' });
  });
});
