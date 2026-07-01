import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createServer } from 'node:http';
import { createBridgeApp } from '../server.js';
import { attachWebSocketServer } from '../websocket-server.js';

const servers: Array<{ close: () => void; readyState?: number }> = [];

afterEach(() => {
  for (const server of servers.splice(0)) {
    try {
      // WebSocket readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
      // HTTP Server doesn't have readyState
      if (server.readyState === undefined || server.readyState === 1) {
        server.close();
      }
    } catch {
      // Already closed
    }
  }
});

describe('bridge websocket server', () => {
  it('accepts side panel commands over websocket and returns session state', async () => {
    const app = createBridgeApp({ context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 } });
    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Collect messages until we get session_state
    const messages: Record<string, unknown>[] = [];
    const messagePromise = new Promise<Record<string, unknown>[]>((resolve) => {
      const handler = (data: Buffer) => {
        messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
        if (messages.some((m) => m.type === 'session_state')) {
          ws.removeListener('message', handler);
          resolve(messages);
        }
      };
      ws.on('message', handler);
    });
    ws.send(JSON.stringify({ type: 'set_cookie_access', enabled: true }));

    const result = await messagePromise;
    const sessionState = result.find((m) => m.type === 'session_state');
    expect(sessionState).toMatchObject({ type: 'session_state', session: { cookieAccessEnabled: true } });
  }, 10000);

  it('sends error response for invalid JSON', async () => {
    const app = createBridgeApp({ context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 } });
    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    const message = new Promise<Record<string, unknown>>((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString()) as Record<string, unknown>));
    });
    ws.send('not valid json');

    await expect(message).resolves.toMatchObject({ type: 'error', error: 'Invalid JSON message' });
  }, 10000);

  it('sends error response for invalid client command', async () => {
    const app = createBridgeApp({ context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 } });
    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    const message = new Promise<Record<string, unknown>>((resolve) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString()) as Record<string, unknown>));
    });
    ws.send(JSON.stringify({ type: 'unknown_command' }));

    await expect(message).resolves.toMatchObject({ type: 'error', error: 'Invalid client command' });
  }, 10000);

  it('handles prompt command and returns prompt_received + session_state', async () => {
    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
      sdkHost,
    });
    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Wait for SDK to be ready
    await app.ready;

    // Collect messages until we get session_state
    const messages: Record<string, unknown>[] = [];
    const messagePromise = new Promise<Record<string, unknown>[]>((resolve) => {
      const handler = (data: Buffer) => {
        messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
        if (messages.some((m) => m.type === 'session_state')) {
          ws.removeListener('message', handler);
          resolve(messages);
        }
      };
      ws.on('message', handler);
    });

    ws.send(JSON.stringify({ type: 'prompt', message: 'Hello Pi' }));

    const result = await messagePromise;
    expect(result.some((m) => m.type === 'prompt_received' && m.message === 'Hello Pi')).toBe(true);
    expect(result.some((m) => m.type === 'session_state')).toBe(true);
  }, 10000);

  it('routes browser_tool_response to browser client registry instead of rejecting', async () => {
    const sdkHost = {
      create: vi.fn().mockResolvedValue({ prompt: vi.fn().mockResolvedValue(undefined) }),
    };
    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
      sdkHost,
    });
    await app.ready;

    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Collect any messages sent back
    const messages: Record<string, unknown>[] = [];
    ws.on('message', (data: Buffer) => {
      messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
    });

    // Send a browser_tool_response — should NOT be rejected with error
    ws.send(JSON.stringify({ id: 'browser-tool-1', type: 'browser_tool_response', success: true, data: { tabs: [] } }));

    // Wait briefly to see if any error response is sent
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Should NOT get an error response — the message is routed silently to the client registry
    const errors = messages.filter((m) => m.type === 'error');
    expect(errors).toHaveLength(0);
  }, 10000);

  it('sends error response when handleClientCommand throws', async () => {
    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
      sdkHost,
    });
    
    // Wait for SDK to be ready
    await app.ready;

    // Monkey-patch handleClientCommand to throw
    const originalHandle = app.handleClientCommand.bind(app);
    app.handleClientCommand = async (...args: Parameters<typeof originalHandle>) => {
      await originalHandle(...args);
      throw new Error('Simulated command error');
    };

    const httpServer = createServer();
    attachWebSocketServer(httpServer, app);
    servers.push(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (typeof address !== 'object' || address === null) throw new Error('missing server address');

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    servers.push(ws);
    await new Promise<void>((resolve) => ws.once('open', resolve));

    // Collect messages until we get an error
    const messages: Record<string, unknown>[] = [];
    const messagePromise = new Promise<Record<string, unknown>[]>((resolve) => {
      const handler = (data: Buffer) => {
        messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
        if (messages.some((m) => m.type === 'error')) {
          ws.removeListener('message', handler);
          resolve(messages);
        }
      };
      ws.on('message', handler);
    });

    ws.send(JSON.stringify({ type: 'prompt', message: 'Will fail' }));

    const result = await messagePromise;
    expect(result.some((m) => m.type === 'prompt_received' && m.message === 'Will fail')).toBe(true);
    const error = result.find((m) => m.type === 'error');
    expect(error).toBeDefined();
    expect(error!.error).toContain('Simulated command error');
  }, 10000);
});
