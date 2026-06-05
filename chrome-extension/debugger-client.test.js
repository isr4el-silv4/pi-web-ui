import { describe, expect, it, vi } from 'vitest';
import { createDebuggerClient } from './debugger-client.js';

describe('debugger client', () => {
  it('gets current tab and sends CDP commands', async () => {
    const chrome = {
      tabs: { query: vi.fn(async () => [{ id: 5, active: true, title: 'T' }]) },
      debugger: { sendCommand: vi.fn(async () => ({ result: true })) },
    };
    const client = createDebuggerClient(chrome);

    await expect(client.getCurrentTab()).resolves.toEqual({ id: 5, active: true, title: 'T' });
    await expect(client.sendCdpCommand(5, 'Runtime.evaluate', { expression: '1' })).resolves.toEqual({ result: true });
  });
});
