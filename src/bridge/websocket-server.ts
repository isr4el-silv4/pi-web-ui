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
    console.log('[Bridge] WebSocket client connected');
    
    // Add WebSocket as a browser client so broadcasts reach it
    const browserClient = app?.browserClients?.addClient({
      send(message: string) {
        if (socket.readyState === 1) {
          const parsed = JSON.parse(message) as { type?: string };
          console.log('[Bridge] Sending to WebSocket:', parsed.type ?? 'unknown');
          socket.send(message);
        } else {
          console.log('[Bridge] WebSocket not ready (state:', socket.readyState, '), dropping message');
        }
      },
    });

    socket.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
        console.log('[Bridge] Received command:', (parsed as any)?.type);
      } catch {
        try {
          socket.send(JSON.stringify({ type: 'error', error: 'Invalid JSON message' }));
        } catch (sendError) {
          console.error('[Bridge] Failed to send error response:', sendError);
        }
        return;
      }

      if (!isClientCommand(parsed)) {
        try {
          socket.send(JSON.stringify({ type: 'error', error: 'Invalid client command' }));
        } catch (sendError) {
          console.error('[Bridge] Failed to send error response:', sendError);
        }
        return;
      }

      try {
        const session = app?.handleClientCommand(parsed);
        socket.send(JSON.stringify({ type: 'session_state', session }));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('[Bridge] Error handling command:', errorMessage);
        try {
          socket.send(JSON.stringify({ type: 'error', error: `Command handling failed: ${errorMessage}` }));
        } catch (sendError) {
          console.error('[Bridge] Failed to send error response:', sendError);
        }
      }
    });

    socket.on('close', () => {
      console.log('[Bridge] WebSocket client disconnected');
      browserClient?.disconnect();
    });

    socket.on('error', (err) => {
      console.error('[Bridge] WebSocket error:', err);
      browserClient?.disconnect();
    });
  });

  return wss;
}
