import { describe, expect, it, vi } from 'vitest';
import { createBrowserClientRegistry } from '../browser-client.js';

describe('browser client registry', () => {
  it('tracks connected clients and broadcasts JSON messages', () => {
    const send = vi.fn();
    const registry = createBrowserClientRegistry();

    const client = registry.addClient({ send });
    registry.broadcast({ type: 'session_state', id: 'session-1' });

    expect(registry.count()).toBe(1);
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'session_state', id: 'session-1' }));

    client.disconnect();
    expect(registry.count()).toBe(0);
  });

  it('sends browser tool requests to the first connected client', async () => {
    const sent: string[] = [];
    const registry = createBrowserClientRegistry();
    const client = registry.addClient({ send: (message) => sent.push(message) });

    const pending = registry.requestBrowserTool('console.getLogs', { tabId: 'active' });
    const request = JSON.parse(sent[0]!);
    client.receive(JSON.stringify({ id: request.id, type: 'browser_tool_response', success: true, data: { logs: [] } }));

    await expect(pending).resolves.toEqual({ logs: [] });
  });

  it('rejects tool requests when no browser client is connected', async () => {
    const registry = createBrowserClientRegistry();

    await expect(registry.requestBrowserTool('console.getLogs', {})).rejects.toThrow('No Chrome extension client connected');
  });
});
