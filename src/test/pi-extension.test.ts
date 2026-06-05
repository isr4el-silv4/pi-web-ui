import { describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { createPiWebUiCommand, registerPiWebUiTools, setController } from '../index.js';
import { createPiWebUiController } from '../pi-extension/launcher.js';

describe('pi-web-ui command', () => {
  it('exports command for reuse', () => {
    const cmd = createPiWebUiCommand();
    expect(cmd.description).toContain('pi-web-ui');
    expect(cmd.getArgumentCompletions).toBeDefined();
    expect(cmd.handler).toBeDefined();
  });

  it('command handler starts bridge on start subcommand', async () => {
    const mockController = createPiWebUiController({
      bridge: { start: vi.fn(async () => ({ pid: 1, port: 43117, alreadyRunning: false })), stop: vi.fn(), status: vi.fn(async () => ({ running: true })), requestBrowserTool: vi.fn() },
      chrome: { open: vi.fn() },
    });
    setController(mockController);
    const cmd = createPiWebUiCommand();
    const ctx = { cwd: '/project', ui: { notify: vi.fn() } } as unknown as ExtensionContext;
    await cmd.handler('start', ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith('pi-web-ui bridge started on port 43117', 'info');
    setController(undefined);
  });

  it('command handler stops bridge on stop subcommand', async () => {
    const mockController = createPiWebUiController({
      bridge: { start: vi.fn(), stop: vi.fn(), status: vi.fn(), requestBrowserTool: vi.fn() },
      chrome: { open: vi.fn() },
    });
    setController(mockController);
    const cmd = createPiWebUiCommand();
    const ctx = { cwd: '/project', ui: { notify: vi.fn() } } as unknown as ExtensionContext;
    await cmd.handler('stop', ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith('pi-web-ui bridge stopped', 'info');
    setController(undefined);
  });

  it('command handler shows status on status subcommand', async () => {
    const mockController = createPiWebUiController({
      bridge: { start: vi.fn(), stop: vi.fn(), status: vi.fn(async () => ({ running: true })), requestBrowserTool: vi.fn() },
      chrome: { open: vi.fn() },
    });
    setController(mockController);
    const cmd = createPiWebUiCommand();
    const ctx = { cwd: '/project', ui: { notify: vi.fn() } } as unknown as ExtensionContext;
    await cmd.handler('status', ctx);
    expect(ctx.ui.notify).toHaveBeenCalled();
    setController(undefined);
  });

  it('command handler opens side panel on open subcommand', async () => {
    const mockController = createPiWebUiController({
      bridge: { start: vi.fn(), stop: vi.fn(), status: vi.fn(), requestBrowserTool: vi.fn() },
      chrome: { open: vi.fn() },
    });
    setController(mockController);
    const cmd = createPiWebUiCommand();
    const ctx = { cwd: '/project', ui: { notify: vi.fn() } } as unknown as ExtensionContext;
    await cmd.handler('open', ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith('pi-web-ui side panel opened', 'info');
    setController(undefined);
  });

  it('command handler shows usage on unknown subcommand', async () => {
    const cmd = createPiWebUiCommand();
    const ctx = { cwd: '/project', ui: { notify: vi.fn() } } as unknown as ExtensionContext;
    await cmd.handler('unknown', ctx);
    expect(ctx.ui.notify).toHaveBeenCalledWith('Usage: /pi-web-ui [start|stop|status|open]', 'warning');
  });
});

describe('register pi-web-ui tools', () => {
  it('registers browser tools through bridge', () => {
    const registered: unknown[] = [];
    const pi = { registerTool: vi.fn((tool) => { registered.push(tool); }) } as unknown as ExtensionAPI;
    registerPiWebUiTools(pi);
    expect(registered).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'browser_get_page_html' })]));
  });
});
