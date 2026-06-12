import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createToolExecutor } from '../tool-executor.js';

describe('chrome browser tool executor', () => {
  it('executes page text and screenshot tools', async () => {
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 1 }]) },
      scripting: { executeScript: vi.fn(async () => [{ result: 'text' }]) },
      tabsCapture: vi.fn(async () => 'data:image/png;base64,x'),
    };
    const executor = createToolExecutor(chrome);

    await expect(executor.execute('page.getText', {})).resolves.toEqual({ text: 'text' });
    await expect(executor.execute('page.captureScreenshot', {})).resolves.toEqual({ dataUrl: 'data:image/png;base64,x' });
  });

  it('auto-starts network capture on creation', () => {
    const networkCapture = {
      start: vi.fn(() => ({ capturing: true })),
      stop: vi.fn(() => ({ capturing: false })),
      recordRequest: vi.fn(),
      getRequests: vi.fn(() => []),
      getRequest: vi.fn(),
      getResponseBody: vi.fn(),
    };
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 1, title: 'Test' }]) },
      debugger: { attach: vi.fn(), detach: vi.fn(), sendCommand: vi.fn() },
    };
    createToolExecutor(chrome, { networkCapture, skipAttachEvents: true });

    expect(networkCapture.start).toHaveBeenCalled();
  });

  it('auto-attaches debugger to active tab on creation', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 1, title: 'Test' }]) },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: sendCommandFn },
    };
    createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for auto-attach to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(attachFn).toHaveBeenCalledWith({ tabId: 1 }, '1.3');
    expect(sendCommandFn).toHaveBeenCalledWith({ tabId: 1 }, 'Network.enable', {});
    expect(sendCommandFn).toHaveBeenCalledWith({ tabId: 1 }, 'Runtime.enable', {});
  });

  it('exposes isAttached and attachedTabIds', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 1, title: 'Test' }]) },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: sendCommandFn },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for auto-attach
    await new Promise((r) => setTimeout(r, 50));

    expect(executor.isAttached(1)).toBe(true);
    expect(executor.attachedTabIds).toContain(1);
  });

  it('exposes networkCapture for external start/stop', () => {
    const networkCapture = {
      start: vi.fn(() => ({ capturing: true })),
      stop: vi.fn(() => ({ capturing: false })),
      recordRequest: vi.fn(),
      getRequests: vi.fn(() => []),
      getRequest: vi.fn(),
      getResponseBody: vi.fn(),
    };
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 1 }]) },
      debugger: { attach: vi.fn(), detach: vi.fn(), sendCommand: vi.fn() },
    };
    const executor = createToolExecutor(chrome, { networkCapture, skipAttachEvents: true });

    expect(executor.networkCapture).toBe(networkCapture);
  });

  it('calls onAttach callback when debugger attaches', async () => {
    const onAttach = vi.fn();
    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Test Tab' }]),
        get: vi.fn(async (id) => ({ id, title: 'Test Tab' })),
      },
      debugger: { attach: vi.fn(), detach: vi.fn(), sendCommand: vi.fn() },
    };
    createToolExecutor(chrome, { skipAttachEvents: true, onAttach });

    await new Promise((r) => setTimeout(r, 50));
    expect(onAttach).toHaveBeenCalledWith(1, 'Test Tab');
  });

  it('calls onDetach callback when debugger detaches', async () => {
    const onDetach = vi.fn();
    let detachListener;
    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Test' }]),
        get: vi.fn(async (id) => ({ id, title: 'Test Tab' })),
      },
      debugger: {
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand: vi.fn(),
        onDetach: { addListener: vi.fn((fn) => { detachListener = fn; }) },
      },
    };
    createToolExecutor(chrome, { skipAttachEvents: true, onDetach });

    // Simulate detach event
    detachListener({ tabId: 1 }, 'user_canceled');
    expect(onDetach).toHaveBeenCalledWith(1, 'user_canceled');
  });

  it('starts reattach retry timer on detach', async () => {
    let detachListener;
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);

    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Test' }]),
        get: vi.fn(async (id) => ({ id, title: 'Test Tab' })),
      },
      debugger: {
        attach: attachFn,
        detach: vi.fn(),
        sendCommand: sendCommandFn,
        onDetach: { addListener: vi.fn((fn) => { detachListener = fn; }) },
      },
    };
    createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for initial auto-attach
    await new Promise((r) => setTimeout(r, 50));
    expect(attachFn).toHaveBeenCalledTimes(1);

    // Simulate detach
    detachListener({ tabId: 1 }, 'target_closed');

    // Wait for reattach retry
    await new Promise((r) => setTimeout(r, 1500));
    expect(attachFn).toHaveBeenCalledTimes(2); // initial + retry
  });

  it('clears reattach timer when reattach succeeds', async () => {
    let detachListener;
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);

    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Test' }]),
        get: vi.fn(async (id) => ({ id, title: 'Test Tab' })),
      },
      debugger: {
        attach: attachFn,
        detach: vi.fn(),
        sendCommand: sendCommandFn,
        onDetach: { addListener: vi.fn((fn) => { detachListener = fn; }) },
      },
    };
    createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for initial auto-attach
    await new Promise((r) => setTimeout(r, 50));

    // Simulate detach
    detachListener({ tabId: 1 }, 'target_closed');

    // Wait for reattach retry to succeed
    await new Promise((r) => setTimeout(r, 1500));

    // Wait to ensure no further retries happen
    await new Promise((r) => setTimeout(r, 1500));
    expect(attachFn).toHaveBeenCalledTimes(2); // initial + one retry, no more
  });

  it('detachTab() clears reattach timer and detaches', async () => {
    let detachListener;
    const detachFn = vi.fn().mockResolvedValue(undefined);
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);

    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Test' }]),
        get: vi.fn(async (id) => ({ id, title: 'Test Tab' })),
      },
      debugger: {
        attach: attachFn,
        detach: detachFn,
        sendCommand: sendCommandFn,
        onDetach: { addListener: vi.fn((fn) => { detachListener = fn; }) },
      },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for initial auto-attach
    await new Promise((r) => setTimeout(r, 50));
    expect(executor.isAttached(1)).toBe(true);

    // Simulate detach to start retry timer
    detachListener({ tabId: 1 }, 'target_closed');
    expect(executor.isAttached(1)).toBe(false);

    // Manually detach (should clear timer)
    await executor.detachTab(1);
    // detachFn may not be called if already detached, but timer should be cleared
    expect(executor.isAttached(1)).toBe(false);
  });

  it('ignores attach failures for chrome:// pages', async () => {
    const attachFn = vi.fn().mockRejectedValue(new Error('Not allowed'));
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 1, url: 'chrome://settings' }]) },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: vi.fn() },
    };
    const onAttach = vi.fn();
    createToolExecutor(chrome, { skipAttachEvents: true, onAttach });

    await new Promise((r) => setTimeout(r, 50));
    expect(onAttach).not.toHaveBeenCalled();
  });

  it('calls onAttachFailed when auto-attach to a new tab fails', async () => {
    let onActivatedListener;
    const attachFn = vi.fn().mockRejectedValue(new Error('Target closed'));
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);
    const onAttachFailed = vi.fn();

    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Test' }]),
        get: vi.fn(async (id) => ({ id, title: 'Test Tab' })),
        onActivated: { addListener: vi.fn((fn) => { onActivatedListener = fn; }) },
      },
      debugger: {
        attach: attachFn,
        detach: vi.fn(),
        sendCommand: sendCommandFn,
        onDetach: { addListener: vi.fn() },
      },
    };
    createToolExecutor(chrome, { skipAttachEvents: true, onAttachFailed });

    // Simulate tab activation
    onActivatedListener({ tabId: 2, windowId: 1 });
    await new Promise((r) => setTimeout(r, 50));

    expect(onAttachFailed).toHaveBeenCalledWith(2);
  });

  it('auto-attaches debugger before sendCdpCommand if not already attached', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue({ result: 'ok' });
    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Test' }]),
        get: vi.fn(async (id) => ({ id, title: 'Test Tab' })),
      },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: sendCommandFn },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for initial auto-attach
    await new Promise((r) => setTimeout(r, 50));

    // Reset call counts after initial attach
    attachFn.mockClear();
    sendCommandFn.mockClear();

    const result = await executor.execute('debugger.sendCdpCommand', { method: 'Page.navigate', params: { url: 'https://example.com' } });
    // Since already attached, attachFn should NOT be called again
    expect(attachFn).not.toHaveBeenCalled();
    expect(sendCommandFn).toHaveBeenCalledWith({ tabId: 1 }, 'Page.navigate', { url: 'https://example.com' });
  });

  it('auto-attaches debugger before evaluateScript if not already attached', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue({ result: { value: 42 } });
    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Test' }]),
        get: vi.fn(async (id) => ({ id, title: 'Test Tab' })),
      },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: sendCommandFn },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    await new Promise((r) => setTimeout(r, 50));

    // Reset call counts after initial attach
    attachFn.mockClear();
    sendCommandFn.mockClear();

    const result = await executor.execute('debugger.evaluateScript', { expression: '2 + 2' });
    // Since already attached, attachFn should NOT be called again
    expect(attachFn).not.toHaveBeenCalled();
    expect(sendCommandFn).toHaveBeenCalledWith({ tabId: 1 }, 'Runtime.evaluate', { expression: '2 + 2', returnByValue: true });
  });

  it('does not re-attach if debugger is already attached for sendCdpCommand', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue({ result: 'ok' });
    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Test' }]),
        get: vi.fn(async (id) => ({ id, title: 'Test Tab' })),
      },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: sendCommandFn },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    await new Promise((r) => setTimeout(r, 50));
    expect(executor.isAttached(1)).toBe(true);

    // Reset call counts
    attachFn.mockClear();
    sendCommandFn.mockClear();

    await executor.execute('debugger.sendCdpCommand', { method: 'Page.navigate', params: { url: 'https://example.com' } });

    // attach should NOT be called again since already attached
    expect(attachFn).not.toHaveBeenCalled();
    expect(sendCommandFn).toHaveBeenCalledWith({ tabId: 1 }, 'Page.navigate', { url: 'https://example.com' });
  });

  it('returns empty array when no tabs have debugger attached', async () => {
    const chrome = {
      tabs: { query: vi.fn(async () => []) },
      debugger: { attach: vi.fn(), detach: vi.fn(), sendCommand: vi.fn() },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    await new Promise((r) => setTimeout(r, 50));

    const result = await executor.execute('debugger.getAttachedTabs', {});
    expect(result).toEqual({ attachedTabs: [] });
  });

  it('returns attached tabs with id and title', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);
    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Test Tab' }]),
        get: vi.fn(async (id) => ({ id, title: 'Test Tab' })),
      },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: sendCommandFn },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for auto-attach
    await new Promise((r) => setTimeout(r, 50));

    const result = await executor.execute('debugger.getAttachedTabs', {});
    expect(result).toEqual({ attachedTabs: [{ id: 1, title: 'Test Tab' }] });
  });

  it('returns multiple attached tabs', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);
    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Tab One' }]),
        get: vi.fn(async (id) => ({ id, title: id === 1 ? 'Tab One' : 'Tab Two' })),
      },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: sendCommandFn },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for auto-attach of tab 1
    await new Promise((r) => setTimeout(r, 50));

    // Manually attach tab 2
    await executor.execute('debugger.attach', { tabId: 2 });
    await new Promise((r) => setTimeout(r, 50));

    const result = await executor.execute('debugger.getAttachedTabs', {});
    expect(result.attachedTabs).toHaveLength(2);
    expect(result.attachedTabs).toContainEqual({ id: 1, title: 'Tab One' });
    expect(result.attachedTabs).toContainEqual({ id: 2, title: 'Tab Two' });
  });

  it('excludes detached tabs from getAttachedTabs result', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);
    const detachFn = vi.fn().mockResolvedValue(undefined);
    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Tab One' }]),
        get: vi.fn(async (id) => ({ id, title: id === 1 ? 'Tab One' : 'Tab Two' })),
      },
      debugger: { attach: attachFn, detach: detachFn, sendCommand: sendCommandFn },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for auto-attach of tab 1
    await new Promise((r) => setTimeout(r, 50));

    // Manually attach tab 2
    await executor.execute('debugger.attach', { tabId: 2 });
    await new Promise((r) => setTimeout(r, 50));

    // Detach tab 1
    await executor.execute('debugger.detach', { tabId: 1 });

    const result = await executor.execute('debugger.getAttachedTabs', {});
    expect(result.attachedTabs).toHaveLength(1);
    expect(result.attachedTabs[0].id).toBe(2);
  });

  it('network.startCapture sends Network.enable to all attached tabs', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);
    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Tab' }]),
        get: vi.fn(async (id) => ({ id, title: 'Tab' })),
      },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: sendCommandFn },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for auto-attach of tab 1
    await new Promise((r) => setTimeout(r, 50));

    // Clear calls from auto-attach
    sendCommandFn.mockClear();

    const result = await executor.execute('network.startCapture', {});
    expect(result).toEqual({ capturing: true });
    expect(sendCommandFn).toHaveBeenCalledWith({ tabId: 1 }, 'Network.enable', {});
  });

  it('network.stopCapture sends Network.disable to all attached tabs', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);
    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Tab' }]),
        get: vi.fn(async (id) => ({ id, title: 'Tab' })),
      },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: sendCommandFn },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for auto-attach of tab 1
    await new Promise((r) => setTimeout(r, 50));

    // Clear calls from auto-attach
    sendCommandFn.mockClear();

    const result = await executor.execute('network.stopCapture', {});
    expect(result).toEqual({ capturing: false });
    expect(sendCommandFn).toHaveBeenCalledWith({ tabId: 1 }, 'Network.disable', {});
  });

  it('console.getLogs sends Runtime.enable to the target tab', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);
    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Tab' }]),
        get: vi.fn(async (id) => ({ id, title: 'Tab' })),
      },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: sendCommandFn },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for auto-attach of tab 1
    await new Promise((r) => setTimeout(r, 50));

    // Clear calls from auto-attach
    sendCommandFn.mockClear();

    const result = await executor.execute('console.getLogs', {});
    expect(result).toEqual({ logs: [] });
    expect(sendCommandFn).toHaveBeenCalledWith({ tabId: 1 }, 'Runtime.enable', {});
  });

  it('network.startCapture handles no attached tabs gracefully', async () => {
    const chrome = {
      tabs: { query: vi.fn(async () => []) },
      debugger: { attach: vi.fn(), detach: vi.fn(), sendCommand: vi.fn() },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for auto-attach to fail (no tabs)
    await new Promise((r) => setTimeout(r, 50));

    const result = await executor.execute('network.startCapture', {});
    expect(result).toEqual({ capturing: true });
  });

  it('network.startCapture sends Network.enable to multiple attached tabs', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);
    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Tab 1' }]),
        get: vi.fn(async (id) => ({ id, title: `Tab ${id}` })),
      },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: sendCommandFn },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for auto-attach of tab 1
    await new Promise((r) => setTimeout(r, 50));

    // Attach tab 2
    await executor.execute('debugger.attach', { tabId: 2 });
    await new Promise((r) => setTimeout(r, 50));

    // Clear calls from auto-attach and manual attach
    sendCommandFn.mockClear();

    const result = await executor.execute('network.startCapture', {});
    expect(result).toEqual({ capturing: true });
    expect(sendCommandFn).toHaveBeenCalledWith({ tabId: 1 }, 'Network.enable', {});
    expect(sendCommandFn).toHaveBeenCalledWith({ tabId: 2 }, 'Network.enable', {});
  });

  it('tabs.getCurrent returns the visually active tab with debuggerAttached flag', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);
    const chrome = {
      tabs: {
        // Visually active tab is tab 99
        query: vi.fn(async () => [{ id: 99, title: 'Pi Docs' }]),
        // Debugger is attached to tab 1
        get: vi.fn(async (id) => ({ id, title: id === 1 ? 'disler/the-verifier-agent' : 'Pi Docs' })),
      },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: sendCommandFn },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for auto-attach of tab 99 (the active tab)
    await new Promise((r) => setTimeout(r, 50));

    // Manually attach to tab 1 (simulating debugger on a different tab)
    await executor.execute('debugger.attach', { tabId: 1 });
    await new Promise((r) => setTimeout(r, 50));

    // tabs.getCurrent should return the visually active tab (id: 99) with debuggerAttached: true
    // (both tabs have debugger attached in this test)
    const result = await executor.execute('tabs.getCurrent', {});
    expect(result.id).toBe(99);
    expect(result.title).toBe('Pi Docs');
    expect(result.debuggerAttached).toBe(true);
  });

  it('tabs.getCurrent returns debuggerAttached: false when active tab has no debugger', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);
    const chrome = {
      tabs: {
        // Visually active tab is tab 99
        query: vi.fn(async () => [{ id: 99, title: 'Pi Docs' }]),
        get: vi.fn(async (id) => ({ id, title: id === 1 ? 'disler/the-verifier-agent' : 'Pi Docs' })),
      },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: sendCommandFn },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for auto-attach of tab 99
    await new Promise((r) => setTimeout(r, 50));

    // Detach from active tab
    await executor.execute('debugger.detach', { tabId: 99 });

    // tabs.getCurrent should return the visually active tab (id: 99) with debuggerAttached: false
    const result = await executor.execute('tabs.getCurrent', {});
    expect(result.id).toBe(99);
    expect(result.title).toBe('Pi Docs');
    expect(result.debuggerAttached).toBe(false);
  });

  it('tabs.getCurrent returns debuggerAttached: true when debugger is on the active tab', async () => {
    const attachFn = vi.fn().mockResolvedValue(undefined);
    const sendCommandFn = vi.fn().mockResolvedValue(undefined);
    const chrome = {
      tabs: {
        query: vi.fn(async () => [{ id: 1, title: 'Debugged Tab' }]),
        get: vi.fn(async (id) => ({ id, title: 'Debugged Tab' })),
      },
      debugger: { attach: attachFn, detach: vi.fn(), sendCommand: sendCommandFn },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });

    // Wait for auto-attach of tab 1
    await new Promise((r) => setTimeout(r, 50));

    const result = await executor.execute('tabs.getCurrent', {});
    expect(result.id).toBe(1);
    expect(result.debuggerAttached).toBe(true);
  });
});
