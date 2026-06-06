import { describe, expect, it, vi } from 'vitest';
import { createBridgeProcessManager } from '../bridge-process.js';

describe('bridge process manager', () => {
  it('spawns the bridge runtime with serialized startup context', async () => {
    const spawn = vi.fn(() => ({ pid: 777, unref: vi.fn() }));
    let probeCallCount = 0;
    const manager = createBridgeProcessManager({
      spawn,
      statusProbe: vi.fn(async () => {
        probeCallCount++;
        if (probeCallCount === 1) return { running: false }; // initial check
        return { running: true, pid: 777, port: 43117 }; // ready after spawn
      }),
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

  it('polls until the bridge is ready before returning', async () => {
    const spawn = vi.fn(() => ({ pid: 999, unref: vi.fn() }));
    let probeCallCount = 0;
    const manager = createBridgeProcessManager({
      spawn,
      statusProbe: vi.fn(async () => {
        probeCallCount++;
        if (probeCallCount === 1) return { running: false }; // initial check
        if (probeCallCount <= 3) return { running: false }; // not ready yet
        return { running: true, pid: 999, port: 43117 }; // ready on 4th call
      }),
      bridgeEntryPath: '/ext/dist/bridge/server.js',
      readyPollIntervalMs: 10,
    });

    const result = await manager.start({
      cwd: '/project',
      permissionMode: 'debug',
      cookieAccessEnabled: false,
      storageAccessEnabled: false,
      port: 43117,
    });

    expect(result.alreadyRunning).toBe(false);
    expect(probeCallCount).toBeGreaterThanOrEqual(3);
  });

  it('throws if the bridge never becomes ready', async () => {
    const spawn = vi.fn(() => ({ pid: 999, unref: vi.fn() }));
    const manager = createBridgeProcessManager({
      spawn,
      statusProbe: vi.fn(async () => ({ running: false })),
      bridgeEntryPath: '/ext/dist/bridge/server.js',
      readyTimeoutMs: 200,
      readyPollIntervalMs: 50,
    });

    await expect(manager.start({
      cwd: '/project',
      permissionMode: 'debug',
      cookieAccessEnabled: false,
      storageAccessEnabled: false,
      port: 43117,
    })).rejects.toThrow('Bridge did not become ready');
  }, 5000);
});
