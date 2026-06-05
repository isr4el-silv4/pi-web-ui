import { describe, expect, it } from 'vitest';
import { createBridgeApp } from '../server.js';

describe('bridge app', () => {
  it('reports bridge status with active session and client count', () => {
    const app = createBridgeApp({
      context: { cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      pid: 999,
    });

    expect(app.status()).toEqual({
      running: true,
      pid: 999,
      port: 43117,
      browserClients: 0,
      session: expect.objectContaining({ cwd: '/project', permissionMode: 'debug' }),
    });
  });

  it('handles side panel commands by updating session state', () => {
    const app = createBridgeApp({
      context: { cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 },
      pid: 999,
    });

    expect(app.handleClientCommand({ type: 'set_permission_mode', mode: 'control' })).toMatchObject({ permissionMode: 'control' });
    expect(app.handleClientCommand({ type: 'set_cookie_access', enabled: true })).toMatchObject({ cookieAccessEnabled: true });
    expect(app.handleClientCommand({ type: 'new_session', cwd: '/other' })).toMatchObject({ cwd: '/other' });
  });
});
