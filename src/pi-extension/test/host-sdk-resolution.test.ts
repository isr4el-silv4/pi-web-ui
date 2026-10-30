import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

const host = vi.hoisted(() => ({ root: '' }));
vi.mock('@earendil-works/pi-coding-agent', () => ({ getPackageDir: () => host.root }));

import { createBridgeProcessManager } from '../bridge-process.js';

it('resolves the SDK through the host loader without overriding the default resolver', async () => {
  host.root = mkdtempSync(join(tmpdir(), 'pi-host-sdk-'));
  try {
    mkdirSync(join(host.root, 'dist'));
    const entry = join(host.root, 'dist', 'index.js');
    writeFileSync(entry, 'export const host = true;');
    const child = {
      pid: 123,
      unref: vi.fn(),
      stderr: { on: vi.fn() },
      on: vi.fn(),
    } as unknown as ChildProcess;
    const spawn = vi.fn((_command: string, _args: string[], _options?: SpawnOptions) => child);
    const manager = createBridgeProcessManager({
      spawn,
      bridgeEntryPath: '/extension/dist/bridge/server.js',
      statusProbe: vi.fn()
        .mockResolvedValueOnce({ running: false })
        .mockResolvedValue({ running: true, pid: 123, port: 43117 }),
    });
    await manager.start({ cwd: process.cwd(), port: 43117, cookieAccessEnabled: false, storageAccessEnabled: false });
    expect(spawn.mock.calls[0][2]?.env?.PI_HOST_PI).toBe(entry);
  } finally {
    rmSync(host.root, { recursive: true, force: true });
    host.root = '';
  }
});
