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
    const app = createBridgeApp({ context: { cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 } });
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
    ws.send(JSON.stringify({ type: 'set_permission_mode', mode: 'control' }));

    await expect(message).resolves.toMatchObject({ type: 'session_state', session: { permissionMode: 'control' } });
  }, 10000);

  it('sends error response for invalid JSON', async () => {
    const app = createBridgeApp({ context: { cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 } });
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
    const app = createBridgeApp({ context: { cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 } });
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
      context: { cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
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

    // Collect messages
    const messages: Record<string, unknown>[] = [];
    const messagePromise = new Promise<Record<string, unknown>[]>((resolve) => {
      const handler = (data: Buffer) => {
        messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
        if (messages.length >= 2) {
          ws.removeListener('message', handler);
          resolve(messages);
        }
      };
      ws.on('message', handler);
    });

    ws.send(JSON.stringify({ type: 'prompt', message: 'Hello Pi' }));

    const result = await messagePromise;
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: 'prompt_received', message: 'Hello Pi' });
    expect(result[1]).toMatchObject({ type: 'session_state' });
  }, 10000);

  it('sends error response when handleClientCommand throws', async () => {
    const sdkHost = {
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn().mockResolvedValue(undefined),
      }),
    };

    const app = createBridgeApp({
      context: { cwd: '/project', permissionMode: 'debug', cookieAccessEnabled: false, storageAccessEnabled: false, port: 0 },
      sdkHost,
    });
    
    // Wait for SDK to be ready
    await app.ready;

    // Monkey-patch handleClientCommand to throw
    const originalHandle = app.handleClientCommand.bind(app);
    app.handleClientCommand = (...args: Parameters<typeof originalHandle>) => {
      originalHandle(...args);
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

    // We should get prompt_received (broadcast) + error response
    const messages: Record<string, unknown>[] = [];
    const messagePromise = new Promise<Record<string, unknown>[]>((resolve) => {
      const handler = (data: Buffer) => {
        messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
        if (messages.length >= 2) {
          ws.removeListener('message', handler);
          resolve(messages);
        }
      };
      ws.on('message', handler);
    });

    ws.send(JSON.stringify({ type: 'prompt', message: 'Will fail' }));

    const result = await messagePromise;
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: 'prompt_received', message: 'Will fail' });
    expect(result[1]).toMatchObject({ type: 'error' });
    expect(result[1].error).toContain('Simulated command error');
  }, 10000);
});
