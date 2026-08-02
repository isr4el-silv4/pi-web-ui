import { describe, expect, it, vi } from 'vitest';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import createExtension, { createPiWebUiCommand, registerPiWebUiTools, setController } from '../index.js';
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

describe('createExtension session_start', () => {
  function createMockPi() {
    const handlers: Record<string, Function> = {};
    const registered: unknown[] = [];
    const pi = {
      on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }),
      registerTool: vi.fn((tool: unknown) => { registered.push(tool); }),
      registerCommand: vi.fn(),
    } as unknown as ExtensionAPI;
    return { pi, handlers, registered };
  }

  it('does NOT register browser tools in TUI (terminal) mode', async () => {
    const { pi, handlers, registered } = createMockPi();
    createExtension(pi);

    const sessionStartHandler = handlers['session_start'];
    expect(sessionStartHandler).toBeDefined();

    const event = { type: 'session_start', reason: 'startup' };
    const ctx = { mode: 'tui', cwd: '/project' } as ExtensionContext;
    await sessionStartHandler(event, ctx);

    expect(registered).toHaveLength(0);
  });

  it('registers browser tools in RPC (Chrome Extension) mode', async () => {
    const { pi, handlers, registered } = createMockPi();
    createExtension(pi);

    const sessionStartHandler = handlers['session_start'];
    const event = { type: 'session_start', reason: 'startup' };
    const ctx = { mode: 'rpc', cwd: '/project' } as ExtensionContext;
    await sessionStartHandler(event, ctx);

    expect(registered.length).toBeGreaterThan(0);
    expect(registered).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'browser_get_page_html' })]));
  });

  it('registers browser tools in json mode', async () => {
    const { pi, handlers, registered } = createMockPi();
    createExtension(pi);

    const sessionStartHandler = handlers['session_start'];
    const event = { type: 'session_start', reason: 'startup' };
    const ctx = { mode: 'json', cwd: '/project' } as ExtensionContext;
    await sessionStartHandler(event, ctx);

    expect(registered.length).toBeGreaterThan(0);
  });

  it('registers browser tools in print mode', async () => {
    const { pi, handlers, registered } = createMockPi();
    createExtension(pi);

    const sessionStartHandler = handlers['session_start'];
    const event = { type: 'session_start', reason: 'startup' };
    const ctx = { mode: 'print', cwd: '/project' } as ExtensionContext;
    await sessionStartHandler(event, ctx);

    expect(registered.length).toBeGreaterThan(0);
  });

  it('always registers the /pi-web-ui command regardless of mode', () => {
    const { pi } = createMockPi();
    createExtension(pi);
    expect(pi.registerCommand).toHaveBeenCalledWith('pi-web-ui', expect.any(Object));
  });
});
