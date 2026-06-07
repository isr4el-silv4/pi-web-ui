import type { Server } from 'node:http';
import { WebSocketServer, WebSocket as WSWebSocket } from 'ws';
import { isClientCommand } from '../protocol/index.js';
import type { createBridgeApp } from './server.js';
import type { BrowserSocketLike } from './browser-client.js';

export function attachWebSocketServer(
  httpServer: Server,
  app?: ReturnType<typeof createBridgeApp>,
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (socket) => {
    // Add WebSocket as a browser client so broadcasts reach it
    const browserClient = app?.browserClients?.addClient({
      send(message: string) {
        if (socket.readyState === 1) {
          socket.send(message);
        }
      },
    });

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

    socket.on('close', () => {
      browserClient?.disconnect();
    });

    socket.on('error', () => {
      browserClient?.disconnect();
    });
  });

  return wss;
}
