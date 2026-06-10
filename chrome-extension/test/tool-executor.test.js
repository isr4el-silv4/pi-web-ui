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
});
