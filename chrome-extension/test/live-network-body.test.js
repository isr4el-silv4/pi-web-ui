import { describe, expect, it, vi } from 'vitest';
import { createToolExecutor } from '../tool-executor.js';

describe('live network response bodies', () => {
  it('falls back to CDP Network.getResponseBody when buffer lacks body', async () => {
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 9 }]) },
      debugger: { sendCommand: vi.fn(async () => ({ body: 'live' })) },
    };
    const networkCapture = { getResponseBody: vi.fn(() => undefined) };
    const executor = createToolExecutor(chrome, { networkCapture, skipAttachEvents: true });
    await expect(executor.execute('network.getResponseBody', { requestId: 'r1' })).resolves.toEqual({ body: 'live' });
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 9 }, 'Network.getResponseBody', { requestId: 'r1' });
  });

  it('enables Runtime and Network domains on debugger attach', async () => {
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 9 }]) },
      debugger: { attach: vi.fn(), sendCommand: vi.fn(async () => ({})) },
    };
    const executor = createToolExecutor(chrome, { skipAttachEvents: true });
    await executor.execute('debugger.attach', {});
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 9 }, 'Runtime.enable', {});
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith({ tabId: 9 }, 'Network.enable', {});
  });
});
