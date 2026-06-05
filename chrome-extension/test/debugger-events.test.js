import { describe, expect, it, vi } from 'vitest';
import { attachDebuggerEventCapture } from '../debugger-events.js';

describe('debugger event capture', () => {
  it('routes Runtime console and Network events into capture buffers', () => {
    let listener;
    const chrome = { debugger: { onEvent: { addListener: vi.fn((fn) => { listener = fn; }) } } };
    const consoleCapture = { record: vi.fn() };
    const networkCapture = { recordRequest: vi.fn(), recordResponseBody: vi.fn() };

    attachDebuggerEventCapture(chrome, { consoleCapture, networkCapture });
    listener({ tabId: 7 }, 'Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'boom' }] });
    listener({ tabId: 7 }, 'Network.requestWillBeSent', { requestId: 'r1', request: { url: 'https://x', method: 'GET' } });

    expect(consoleCapture.record).toHaveBeenCalledWith(expect.objectContaining({ tabId: 7, level: 'error', text: 'boom' }));
    expect(networkCapture.recordRequest).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'r1', url: 'https://x', method: 'GET', tabId: 7 }));
  });
});
