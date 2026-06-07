import { createBrowserToolRequest, isBrowserToolResponse, type BrowserToolName, type JsonObject, type JsonValue } from '../protocol/index.js';

export interface BrowserSocketLike {
  send(message: string): void;
}

export interface BrowserClient {
  receive(message: string): void;
  disconnect(): void;
}

export interface BrowserClientRegistry {
  addClient(socket: BrowserSocketLike): BrowserClient;
  count(): number;
  broadcast(message: JsonObject): void;
  requestBrowserTool(tool: BrowserToolName, params: JsonObject): Promise<JsonValue | undefined>;
}

export function createBrowserClientRegistry(): BrowserClientRegistry {
  const sockets = new Set<BrowserSocketLike>();
  const pending = new Map<string, { resolve: (value: JsonValue | undefined) => void; reject: (error: Error) => void }>();
  let nextId = 1;

  return {
    addClient(socket) {
      sockets.add(socket);
      return {
        receive(message) {
          const parsed = JSON.parse(message) as unknown;
          if (!isBrowserToolResponse(parsed)) return;
          const waiter = pending.get(parsed.id);
          if (!waiter) return;
          pending.delete(parsed.id);
          if (parsed.success) waiter.resolve(parsed.data);
          else waiter.reject(new Error(parsed.error ?? 'Browser tool request failed'));
        },
        disconnect() {
          sockets.delete(socket);
        },
      };
    },
    count() {
      return sockets.size;
    },
    broadcast(message) {
      const serialized = JSON.stringify(message);
      console.log('[Bridge] Broadcasting to', sockets.size, 'client(s):', message.type);
      for (const socket of sockets) socket.send(serialized);
    },
    requestBrowserTool(tool, params) {
      const [socket] = sockets;
      if (!socket) return Promise.reject(new Error('No Chrome extension client connected'));
      const id = `browser-tool-${nextId++}`;
      const request = createBrowserToolRequest(id, tool, params);
      socket.send(JSON.stringify(request));
      return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
    },
  };
}
