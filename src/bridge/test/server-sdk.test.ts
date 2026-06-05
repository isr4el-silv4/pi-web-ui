import { describe, expect, it, vi } from 'vitest';
import { createBridgeApp } from '../server.js';

describe('bridge app sdk session integration', () => {
  it('creates an SDK session on startup and when switching sessions', async () => {
    const sdkHost = { create: vi.fn(async (options) => ({ sdk: true, ...options })) };
    const app = createBridgeApp({
      context: { cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    await app.ready;
    expect(sdkHost.create).toHaveBeenCalledWith({ cwd: '/project', sessionPath: undefined });

    app.handleClientCommand({ type: 'resume_session', sessionPath: '/s.jsonl' });
    await app.ready;
    expect(sdkHost.create).toHaveBeenLastCalledWith({ cwd: '/project', sessionPath: '/s.jsonl' });
  });
});
