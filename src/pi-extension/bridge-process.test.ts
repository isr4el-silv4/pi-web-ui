import { describe, expect, it, vi } from 'vitest';
import { createBridgeProcessManager } from './bridge-process.js';

describe('bridge process manager', () => {
  it('spawns the bridge runtime with serialized startup context', async () => {
    const spawn = vi.fn(() => ({ pid: 777, unref: vi.fn() }));
    const manager = createBridgeProcessManager({
      spawn,
      statusProbe: vi.fn(async () => ({ running: false })),
      bridgeEntryPath: '/ext/dist/bridge/server.js',
    });

    const result = await manager.start({
      cwd: '/project',
      permissionMode: 'debug',
      cookieAccessEnabled: false,
      storageAccessEnabled: false,
      port: 43117,
    });

    expect(spawn).toHaveBeenCalledWith(process.execPath, ['/ext/dist/bridge/server.js'], {
      cwd: '/project',
      detached: true,
      env: expect.objectContaining({
        PI_WEB_UI_START_CONTEXT: JSON.stringify({
          cwd: '/project',
          permissionMode: 'debug',
          cookieAccessEnabled: false,
          storageAccessEnabled: false,
          port: 43117,
        }),
      }),
      stdio: 'ignore',
    });
    expect(result).toEqual({ pid: 777, port: 43117, alreadyRunning: false });
  });

  it('does not spawn when status probe finds a running bridge', async () => {
    const spawn = vi.fn();
    const manager = createBridgeProcessManager({
      spawn,
      statusProbe: vi.fn(async () => ({ running: true, pid: 12, port: 43117 })),
      bridgeEntryPath: '/ext/dist/bridge/server.js',
    });

    await expect(manager.start({ cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 })).resolves.toEqual({ pid: 12, port: 43117, alreadyRunning: true });
    expect(spawn).not.toHaveBeenCalled();
  });
});
