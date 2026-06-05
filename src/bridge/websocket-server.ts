import type { Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { isClientCommand } from '../protocol/index.js';
import type { createBridgeApp } from './server.js';

export function attachWebSocketServer(httpServer: Server, app?: ReturnType<typeof createBridgeApp>): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (socket) => {
    socket.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        socket.send(JSON.stringify({ type: 'error', error: 'Invalid JSON message' }));
        return;
      }

      if (!isClientCommand(parsed)) {
        socket.send(JSON.stringify({ type: 'error', error: 'Invalid client command' }));
        return;
      }

      const session = app?.handleClientCommand(parsed);
      socket.send(JSON.stringify({ type: 'session_state', session }));
    });
  });

  return wss;
}
