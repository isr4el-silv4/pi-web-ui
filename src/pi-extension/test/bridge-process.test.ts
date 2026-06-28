import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { createBridgeProcessManager } from '../bridge-process.js';

function mockChild(pid: number): ChildProcess {
  return {
    pid,
    unref: vi.fn(),
    stderr: { on: vi.fn() },
    on: vi.fn(),
  } as unknown as ChildProcess;
}

describe('bridge process manager', () => {
  it('spawns the bridge runtime with serialized startup context', async () => {
    const spawn = vi.fn(() => mockChild(777));
    let probeCallCount = 0;
    const manager = createBridgeProcessManager({
      spawn,
      statusProbe: vi.fn(async () => {
        probeCallCount++;
        if (probeCallCount === 1) return { running: false };
        return { running: true, pid: 777, port: 43117 };
      }),
      bridgeEntryPath: '/ext/dist/bridge/server.js',
    });

    const result = await manager.start({
      cwd: '/project',
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
          cookieAccessEnabled: false,
          storageAccessEnabled: false,
          port: 43117,
        }),
      }),
      stdio: ['ignore', 'ignore', 'pipe'],
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

    await expect(manager.start({ cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 43117 })).resolves.toEqual({ pid: 12, port: 43117, alreadyRunning: true });
    expect(spawn).not.toHaveBeenCalled();
  });

  it('polls until the bridge is ready before returning', async () => {
    const spawn = vi.fn(() => mockChild(999));
    let probeCallCount = 0;
    const manager = createBridgeProcessManager({
      spawn,
      statusProbe: vi.fn(async () => {
        probeCallCount++;
        if (probeCallCount === 1) return { running: false };
        if (probeCallCount <= 3) return { running: false };
        return { running: true, pid: 999, port: 43117 };
      }),
      bridgeEntryPath: '/ext/dist/bridge/server.js',
      readyPollIntervalMs: 10,
    });

    const result = await manager.start({
      cwd: '/project',
      cookieAccessEnabled: false,
      storageAccessEnabled: false,
      port: 43117,
    });

    expect(result.alreadyRunning).toBe(false);
    expect(probeCallCount).toBeGreaterThanOrEqual(3);
  });

  it('throws if the bridge never becomes ready', async () => {
    const spawn = vi.fn(() => mockChild(999));
    const manager = createBridgeProcessManager({
      spawn,
      statusProbe: vi.fn(async () => ({ running: false })),
      bridgeEntryPath: '/ext/dist/bridge/server.js',
      readyTimeoutMs: 200,
      readyPollIntervalMs: 50,
    });

    await expect(manager.start({
      cwd: '/project',
      cookieAccessEnabled: false,
      storageAccessEnabled: false,
      port: 43117,
    })).rejects.toThrow('Bridge did not become ready');
  }, 5000);

  it('includes stderr in error when bridge fails to start', async () => {
    let stderrCallback: ((data: Buffer) => void) | undefined;
    const spawn = vi.fn(() => {
      const child = mockChild(999);
      (child.stderr as any).on = vi.fn((_event: string, cb: (data: Buffer) => void) => {
        stderrCallback = cb;
      });
      return child;
    });
    const manager = createBridgeProcessManager({
      spawn,
      statusProbe: vi.fn(async () => {
        if (stderrCallback) {
          stderrCallback(Buffer.from('Error: Cannot find module "ws"'));
        }
        return { running: false };
      }),
      bridgeEntryPath: '/ext/dist/bridge/server.js',
      readyTimeoutMs: 200,
      readyPollIntervalMs: 50,
    });

    await expect(manager.start({
      cwd: '/project',
      cookieAccessEnabled: false,
      storageAccessEnabled: false,
      port: 43117,
    })).rejects.toThrow('Bridge stderr:');
  }, 5000);

  it('stops the bridge by calling /stop endpoint', async () => {
    let running = true;
    const manager = createBridgeProcessManager({
      spawn: vi.fn(() => mockChild(777)),
      statusProbe: vi.fn(async () => ({ running, pid: 777, port: 43117 })),
      bridgeEntryPath: '/ext/dist/bridge/server.js',
      stopFn: vi.fn(async () => { running = false; }),
    });

    await manager.stop();
    expect(running).toBe(false);
  });

  it('does not throw when stopping a bridge that is already stopped', async () => {
    const stopFn = vi.fn(async () => {});
    const manager = createBridgeProcessManager({
      spawn: vi.fn(() => mockChild(777)),
      statusProbe: vi.fn(async () => ({ running: false })),
      bridgeEntryPath: '/ext/dist/bridge/server.js',
      stopFn,
    });

    await expect(manager.stop()).resolves.toBeUndefined();
    expect(stopFn).not.toHaveBeenCalled();
  });

  it('resolves bridge entry path correctly from src or dist', async () => {
    const { defaultBridgeEntryPath } = await import('../bridge-process.js');
    const path = defaultBridgeEntryPath();
    // Accept both .js (built dist) and .ts (Pi dev, no build needed)
    expect(path).toMatch(/bridge\/server\.(js|ts)$/);
  });

  it('fallback path should not contain src/dist pattern', async () => {
    // Regression test: the fallback path when dist doesn't exist but src does
    // should resolve to <project-root>/dist/bridge/server.js, not <project-root>/src/dist/bridge/server.js
    const { defaultBridgeEntryPath } = await import('../bridge-process.js');
    const path = defaultBridgeEntryPath();
    // The path should never contain '/src/dist/' - that's a bug
    expect(path).not.toMatch(/src\/dist\//);
  });

  it('spawns with npx tsx when bridge entry is a .ts file', async () => {
    const spawn = vi.fn(() => mockChild(888));
    let probeCallCount = 0;
    const manager = createBridgeProcessManager({
      spawn,
      statusProbe: vi.fn(async () => {
        probeCallCount++;
        if (probeCallCount === 1) return { running: false };
        return { running: true, pid: 888, port: 43117 };
      }),
      bridgeEntryPath: '/ext/src/bridge/server.ts',
    });

    await manager.start({
      cwd: '/project',
      cookieAccessEnabled: false,
      storageAccessEnabled: false,
      port: 43117,
    });

    expect(spawn).toHaveBeenCalledWith('npx', ['tsx', '/ext/src/bridge/server.ts'], {
      cwd: '/project',
      detached: true,
      env: expect.any(Object),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  });

  it('spawns with node when bridge entry is a .js file', async () => {
    const spawn = vi.fn(() => mockChild(999));
    let probeCallCount = 0;
    const manager = createBridgeProcessManager({
      spawn,
      statusProbe: vi.fn(async () => {
        probeCallCount++;
        if (probeCallCount === 1) return { running: false };
        return { running: true, pid: 999, port: 43117 };
      }),
      bridgeEntryPath: '/ext/dist/bridge/server.js',
    });

    await manager.start({
      cwd: '/project',
      cookieAccessEnabled: false,
      storageAccessEnabled: false,
      port: 43117,
    });

    expect(spawn).toHaveBeenCalledWith(process.execPath, ['/ext/dist/bridge/server.js'], {
      cwd: '/project',
      detached: true,
      env: expect.any(Object),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  });
});
