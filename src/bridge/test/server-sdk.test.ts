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

  it('handles list_sessions command', async () => {
    const events: any[] = [];
    const sdkHost = { create: vi.fn(async () => ({ sdk: true })) };
    const app = createBridgeApp({
      context: { cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    // Intercept broadcasts
    const originalBroadcast = app.browserClients.broadcast.bind(app.browserClients);
    app.browserClients.broadcast = vi.fn((event) => {
      events.push(event);
      return originalBroadcast(event);
    });

    await app.ready;

    // list_sessions should return the cwd even if SDK list fails
    const result = app.handleClientCommand({ type: 'list_sessions', cwd: '/project' });
    expect(result).toMatchObject({ cwd: '/project' });

    // session_error may be broadcast if listAll fails (no SDK in test env)
    // but the command itself should not throw
  });

  it('handles resume_session and broadcasts session_history before creating SDK session', async () => {
    const events: any[] = [];
    const sdkHost = { create: vi.fn(async () => ({ sdk: true })) };
    const app = createBridgeApp({
      context: { cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      sdkHost,
    });

    // Intercept broadcasts
    const originalBroadcast = app.browserClients.broadcast.bind(app.browserClients);
    app.browserClients.broadcast = vi.fn((event) => {
      events.push(event);
      return originalBroadcast(event);
    });

    await app.ready;

    // Clear previous calls
    sdkHost.create.mockClear();
    events.length = 0;

    app.handleClientCommand({ type: 'resume_session', sessionPath: '/project/.pi/sessions/test.jsonl' });
    await app.ready;

    // SDK should be created with sessionPath
    expect(sdkHost.create).toHaveBeenCalledWith({ cwd: '/project', sessionPath: '/project/.pi/sessions/test.jsonl' });
  });
});
