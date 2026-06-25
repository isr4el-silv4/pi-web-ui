import { describe, expect, it, vi } from 'vitest';
import { createPiWebUiController, parsePiWebUiCommand } from '../launcher.js';

describe('pi-web-ui launcher command parsing', () => {
  it('parses supported commands', () => {
    expect(parsePiWebUiCommand(['start'])).toEqual({ command: 'start' });
    expect(parsePiWebUiCommand(['stop'])).toEqual({ command: 'stop' });
    expect(parsePiWebUiCommand(['status'])).toEqual({ command: 'status' });
    expect(parsePiWebUiCommand(['open'])).toEqual({ command: 'open' });
  });

  it('defaults to status for empty command input', () => {
    expect(parsePiWebUiCommand([])).toEqual({ command: 'status' });
  });

  it('rejects unknown commands', () => {
    expect(() => parsePiWebUiCommand(['dance'])).toThrow('Unsupported /pi-web-ui command: dance');
  });
});

describe('pi-web-ui controller', () => {
  it('starts the bridge with terminal context defaults and opens Chrome', async () => {
    const bridge = {
      start: vi.fn(async () => ({ pid: 1234, port: 43117, alreadyRunning: false })),
      stop: vi.fn(),
      status: vi.fn(),
      requestBrowserTool: vi.fn(),
    };
    const chrome = { open: vi.fn(async () => undefined) };
    const controller = createPiWebUiController({ bridge, chrome });

    const result = await controller.start({ cwd: '/project', sessionPath: '/session.jsonl' });

    expect(bridge.start).toHaveBeenCalledWith({
      cwd: '/project',
      sessionPath: '/session.jsonl',
      cookieAccessEnabled: false,
      storageAccessEnabled: false,
      port: 43117,
    });
    expect(chrome.open).toHaveBeenCalledWith({ port: 43117 });
    expect(result).toEqual('Pi Web UI bridge started on port 43117.');
  });

  it('reports already running bridge when start is idempotent', async () => {
    const controller = createPiWebUiController({
      bridge: {
        start: vi.fn(async () => ({ pid: 1234, port: 43117, alreadyRunning: true })),
        stop: vi.fn(),
        status: vi.fn(),
        requestBrowserTool: vi.fn(),
      },
      chrome: { open: vi.fn(async () => undefined) },
    });

    await expect(controller.start({ cwd: '/project' })).resolves.toBe('Pi Web UI bridge already running on port 43117.');
  });

  it('returns bridge status text', async () => {
    const controller = createPiWebUiController({
      bridge: {
        start: vi.fn(),
        stop: vi.fn(),
        status: vi.fn(async () => ({ running: true, pid: 1234, port: 43117 })),
        requestBrowserTool: vi.fn(),
      },
      chrome: { open: vi.fn() },
    });

    await expect(controller.status()).resolves.toBe('Pi Web UI bridge is running on port 43117 (pid 1234).');
  });

  it('starts the bridge successfully even when Chrome open fails', async () => {
    const bridge = {
      start: vi.fn(async () => ({ pid: 1234, port: 43117, alreadyRunning: false })),
      stop: vi.fn(),
      status: vi.fn(),
      requestBrowserTool: vi.fn(),
    };
    const chrome = { open: vi.fn(async () => { throw new Error('Chrome browser not found'); }) };
    const controller = createPiWebUiController({ bridge, chrome });

    const result = await controller.start({ cwd: '/project' });

    expect(bridge.start).toHaveBeenCalled();
    expect(chrome.open).toHaveBeenCalledWith({ port: 43117 });
    expect(result).toEqual('Pi Web UI bridge started on port 43117.');
  });

  it('starts the bridge successfully even when Chrome open fails (already running)', async () => {
    const controller = createPiWebUiController({
      bridge: {
        start: vi.fn(async () => ({ pid: 1234, port: 43117, alreadyRunning: true })),
        stop: vi.fn(),
        status: vi.fn(),
        requestBrowserTool: vi.fn(),
      },
      chrome: { open: vi.fn(async () => { throw new Error('Chrome browser not found'); }) },
    });

    const result = await controller.start({ cwd: '/project' });

    expect(result).toEqual('Pi Web UI bridge already running on port 43117.');
  });
});
