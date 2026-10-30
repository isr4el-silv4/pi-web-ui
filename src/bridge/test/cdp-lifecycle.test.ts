import { afterEach, describe, expect, it, vi } from 'vitest';
import { evaluateBrowserToolPermission } from '../permissions.js';
import { createBrowserToolExecutor } from '../browser-tools.js';
import { createExtensionUiAdapter } from '../extension-ui-adapter.js';
import { createBrowserClientRegistry } from '../browser-client.js';

const session = { id: 's', cwd: '/', cookieAccessEnabled: false, storageAccessEnabled: false };
const readMethods = ['DOM.getDocument', 'DOM.describeNode', 'DOM.getAttributes', 'DOM.getOuterHTML', 'DOM.querySelector', 'DOM.querySelectorAll'];

afterEach(() => vi.useRealTimers());

describe('CDP permission boundaries', () => {
  it.each(readMethods)('allows the read-only method %s without a dialog', async (method) => {
    const confirm = vi.fn();
    const requestBrowserTool = vi.fn(async () => ({ ok: true }));
    const executor = createBrowserToolExecutor({ confirm, requestBrowserTool }, session);
    await expect(executor.execute('debugger.sendCdpCommand', { method })).resolves.toEqual({ ok: true });
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each(['Runtime.evaluate', 'Page.navigate', 'DOM.setAttributeValue', 'DOM.getDocument.extra', 'Network.getCookies', undefined])('still requires approval for %s', (method) => {
    expect(evaluateBrowserToolPermission(session, 'debugger.sendCdpCommand', method ? { method } : {})).toMatchObject({ allowed: false, requiresConfirmation: true });
  });

  it('does not bypass cookie, storage or script controls', () => {
    for (const tool of ['cookies.get', 'storage.getLocal', 'debugger.evaluateScript'] as const) {
      expect(evaluateBrowserToolPermission(session, tool, { method: 'DOM.getDocument' }).allowed).toBe(false);
    }
  });
});

describe('permission request lifecycle', () => {
  it('does not reuse approval IDs across adapter instances', async () => {
    const firstBroadcast = vi.fn();
    const secondBroadcast = vi.fn();
    const first = createExtensionUiAdapter({ broadcast: firstBroadcast });
    const second = createExtensionUiAdapter({ broadcast: secondBroadcast });
    const firstRequest = first.confirm('First').catch(() => false);
    const secondRequest = second.confirm('Second').catch(() => false);
    const firstId = firstBroadcast.mock.calls[0][0].id;
    const secondId = secondBroadcast.mock.calls[0][0].id;
    expect(firstId).not.toBe(secondId);
    expect(second.respond({ id: firstId, value: true })).toBe(false);
    first.cancelPending();
    second.cancelPending();
    await Promise.all([firstRequest, secondRequest]);
  });
  it('withdraws a canceled dialog and ignores a late approval', async () => {
    const broadcast = vi.fn();
    const ui = createExtensionUiAdapter({ broadcast });
    const controller = new AbortController();
    const requestBrowserTool = vi.fn();
    const executor = createBrowserToolExecutor({ confirm: ui.confirm, requestBrowserTool }, session);
    const pending = executor.execute('debugger.sendCdpCommand', { method: 'Page.navigate' }, { signal: controller.signal });
    const rejection = expect(pending).rejects.toThrow();
    const id = broadcast.mock.calls[0][0].id;
    controller.abort();
    await rejection;
    expect(ui.respond({ id, value: true })).toBe(false);
    expect(requestBrowserTool).not.toHaveBeenCalled();
    expect(broadcast).toHaveBeenCalledWith({ type: 'extension_ui_request_timeout', id });
  });

  it('rechecks cancellation even when the confirmation provider ignores its signal', async () => {
    const controller = new AbortController();
    let approve!: (value: boolean) => void;
    const confirm = vi.fn(() => new Promise<boolean>((resolve) => { approve = resolve; }));
    const requestBrowserTool = vi.fn();
    const executor = createBrowserToolExecutor({ confirm, requestBrowserTool }, session);
    const pending = executor.execute('debugger.evaluateScript', {}, { signal: controller.signal });
    const rejection = expect(pending).rejects.toThrow();
    controller.abort();
    approve(true);
    await rejection;
    expect(requestBrowserTool).not.toHaveBeenCalled();
  });

  it('expires a dialog, removes its ID and clears its timer', async () => {
    vi.useFakeTimers();
    const broadcast = vi.fn();
    const ui = createExtensionUiAdapter({ broadcast });
    const pending = ui.confirm('Synthetic approval');
    const rejection = expect(pending).rejects.toThrow(/expired|timed out/i);
    const id = broadcast.mock.calls[0][0].id;
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    expect(ui.respond({ id, value: true })).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not treat an arbitrary truthy response as permission', async () => {
    const broadcast = vi.fn();
    const ui = createExtensionUiAdapter({ broadcast });
    const pending = ui.confirm('Synthetic approval');
    ui.respond({ id: broadcast.mock.calls[0][0].id, value: { confirmed: false } });
    await expect(pending).resolves.toBe(false);
  });
});

describe('browser transport lifecycle', () => {
  it('does not reuse browser request IDs across registry instances', async () => {
    const first = createBrowserClientRegistry();
    const second = createBrowserClientRegistry();
    const firstSend = vi.fn();
    const secondSend = vi.fn();
    first.addClient({ send: firstSend });
    const secondClient = second.addClient({ send: secondSend });
    const firstPending = first.requestBrowserTool('page.getText', {});
    const secondPending = second.requestBrowserTool('page.getText', {});
    const checks = [expect(firstPending).rejects.toThrow(/unknown/), expect(secondPending).rejects.toThrow(/unknown/)];
    const oldId = JSON.parse(firstSend.mock.calls[0][0]).id;
    expect(JSON.parse(secondSend.mock.calls[0][0]).id).not.toBe(oldId);
    secondClient.receive(JSON.stringify({ id: oldId, type: 'browser_tool_response', success: true, data: 'stale' }));
    first.cancelPending();
    second.cancelPending();
    await Promise.all(checks);
  });
  it('rejects the owning client requests on disconnect without replaying them', async () => {
    const registry = createBrowserClientRegistry();
    const send = vi.fn();
    const client = registry.addClient({ send });
    const pending = registry.requestBrowserTool('page.getText', {});
    const rejection = expect(pending).rejects.toThrow(/disconnected.*unknown/i);
    client.disconnect();
    await rejection;
    registry.addClient({ send });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('rejects a canceled dispatched request and ignores its late result', async () => {
    vi.useFakeTimers();
    const registry = createBrowserClientRegistry();
    const send = vi.fn();
    const client = registry.addClient({ send });
    const controller = new AbortController();
    const pending = registry.requestBrowserTool('page.getText', {}, { signal: controller.signal });
    const rejection = expect(pending).rejects.toThrow(/unknown/i);
    const request = JSON.parse(send.mock.calls[0][0]);
    controller.abort();
    await rejection;
    client.receive(JSON.stringify({ id: request.id, type: 'browser_tool_response', success: true, data: 'late' }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles stalled browser requests at the deadline', async () => {
    vi.useFakeTimers();
    const registry = createBrowserClientRegistry();
    registry.addClient({ send: vi.fn() });
    const pending = registry.requestBrowserTool('page.getText', {});
    const rejection = expect(pending).rejects.toThrow(/timed out.*unknown/i);
    await vi.advanceTimersByTimeAsync(30_000);
    await rejection;
    expect(vi.getTimerCount()).toBe(0);
  });
});
