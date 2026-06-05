import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { createServer } from 'node:http';
import { createBridgeApp } from '../server.js';
import { attachWebSocketServer } from '../websocket-server.js';

const servers: Array<{ close: () => void }> = [];

afterEach(() => {
  for (const server of servers.splice(0)) server.close();
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
  });
});
