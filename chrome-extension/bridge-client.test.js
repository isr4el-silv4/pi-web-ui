import { describe, expect, it, vi } from 'vitest';
import { createBridgeClient } from './bridge-client.js';

describe('extension bridge client', () => {
  it('connects to the local bridge websocket', () => {
    const sockets = [];
    class FakeWebSocket {
      constructor(url) { this.url = url; sockets.push(this); }
      addEventListener() {}
      send() {}
      close() {}
    }

    const client = createBridgeClient({ WebSocketCtor: FakeWebSocket, port: 43117 });
    client.connect();

    expect(sockets[0].url).toBe('ws://127.0.0.1:43117');
  });

  it('serializes commands when connected', () => {
    const sent = [];
    class FakeWebSocket {
      constructor() { this.readyState = 1; }
      addEventListener() {}
      send(message) { sent.push(message); }
      close() {}
    }

    const client = createBridgeClient({ WebSocketCtor: FakeWebSocket, port: 43117 });
    client.connect();
    client.sendCommand({ type: 'prompt', message: 'Check console errors' });

    expect(sent).toEqual([JSON.stringify({ type: 'prompt', message: 'Check console errors' })]);
  });

  it('notifies lifecycle and parsed messages', () => {
    const listeners = {};
    class FakeWebSocket {
      constructor() { this.readyState = 1; }
      addEventListener(name, handler) { listeners[name] = handler; }
      send() {}
      close() {}
    }
    const onEvent = vi.fn();

    const client = createBridgeClient({ WebSocketCtor: FakeWebSocket, port: 43117, onEvent });
    client.connect();
    listeners.open();
    listeners.message({ data: JSON.stringify({ type: 'session_state', session: { id: 's1' } }) });
    listeners.close();

    expect(onEvent).toHaveBeenCalledWith({ type: 'bridge_connected' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'session_state', session: { id: 's1' } });
    expect(onEvent).toHaveBeenCalledWith({ type: 'bridge_disconnected' });
  });
});
