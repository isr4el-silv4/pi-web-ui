import { describe, expect, it, vi } from 'vitest';
import { createBridgeClient } from '../bridge-client.js';

function createFakeWebSocket({ listeners = {}, sent = [], readyState = 1 } = {}) {
  class FakeWebSocket {
    constructor() { this.readyState = readyState; }
    addEventListener(name, handler) { listeners[name] = handler; }
    send(message) { sent.push(message); }
    close() {}
  }
  return { FakeWebSocket, listeners, sent };
}

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

  it('executes browser tool requests and responds to bridge', async () => {
    const listeners = {};
    const sent = [];
    class FakeWebSocket {
      constructor() { this.readyState = 1; }
      addEventListener(name, handler) { listeners[name] = handler; }
      send(message) { sent.push(message); }
      close() {}
    }
    const client = createBridgeClient({ WebSocketCtor: FakeWebSocket, port: 43117, executeTool: async () => ({ text: 'ok' }) });
    client.connect();
    await listeners.message({ data: JSON.stringify({ id: 'r1', type: 'browser_tool_request', tool: 'page.getText', params: {} }) });
    expect(sent).toEqual([JSON.stringify({ id: 'r1', type: 'browser_tool_response', success: true, data: { text: 'ok' } })]);
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
    listeners.close({ code: 1000, reason: '' });

    expect(onEvent).toHaveBeenCalledWith({ type: 'bridge_connected' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'session_state', session: { id: 's1' } });
    expect(onEvent).toHaveBeenCalledWith({ type: 'bridge_disconnected' });
  });

  it('handles messages without a type property without crashing', () => {
    const { FakeWebSocket, listeners, sent } = createFakeWebSocket();
    const onEvent = vi.fn();

    const client = createBridgeClient({ WebSocketCtor: FakeWebSocket, port: 43117, onEvent });
    client.connect();

    // Send a message without a type property
    listeners.message({ data: JSON.stringify({ foo: 'bar' }) });

    // Should not crash and should forward the message to onEvent
    expect(onEvent).toHaveBeenCalledWith({ foo: 'bar' });
  });

  it('handles non-object JSON messages without crashing', () => {
    const { FakeWebSocket, listeners } = createFakeWebSocket();
    const onEvent = vi.fn();

    const client = createBridgeClient({ WebSocketCtor: FakeWebSocket, port: 43117, onEvent });
    client.connect();

    // Send an array
    listeners.message({ data: JSON.stringify([1, 2, 3]) });
    // Send a string
    listeners.message({ data: JSON.stringify('hello') });
    // Send null
    listeners.message({ data: JSON.stringify(null) });

    // Should report parse errors for non-object messages
    expect(onEvent).toHaveBeenCalledWith({ type: 'error', error: 'Invalid bridge message' });
    expect(onEvent.mock.calls.filter(c => c[0].type === 'error')).toHaveLength(3);
  });

  it('receives prompt acknowledgment and session state after sending a prompt', () => {
    const { FakeWebSocket, listeners, sent } = createFakeWebSocket();
    const onEvent = vi.fn();

    const client = createBridgeClient({ WebSocketCtor: FakeWebSocket, port: 43117, onEvent });
    client.connect();

    // Simulate connection open
    listeners.open();

    // Send a prompt command
    client.sendCommand({ type: 'prompt', message: 'Hello Pi' });

    // Verify the command was sent
    expect(sent).toEqual([JSON.stringify({ type: 'prompt', message: 'Hello Pi' })]);

    // Simulate server responses: prompt_received + session_state
    listeners.message({ data: JSON.stringify({ type: 'prompt_received', message: 'Hello Pi' }) });
    listeners.message({ data: JSON.stringify({ type: 'session_state', session: { id: 's1', permissionMode: 'debug' } }) });

    // Verify both responses were forwarded
    expect(onEvent).toHaveBeenCalledWith({ type: 'prompt_received', message: 'Hello Pi' });
    expect(onEvent).toHaveBeenCalledWith({ type: 'session_state', session: { id: 's1', permissionMode: 'debug' } });
  });

  it('receives assistant_message from bridge', () => {
    const { FakeWebSocket, listeners } = createFakeWebSocket();
    const onEvent = vi.fn();

    const client = createBridgeClient({ WebSocketCtor: FakeWebSocket, port: 43117, onEvent });
    client.connect();
    listeners.open();

    // Simulate assistant response from bridge
    listeners.message({ data: JSON.stringify({ type: 'assistant_message', text: 'Hello from Pi!' }) });

    expect(onEvent).toHaveBeenCalledWith({ type: 'assistant_message', text: 'Hello from Pi!' });
  });

  it('throws when sending command without connection', () => {
    const { FakeWebSocket } = createFakeWebSocket({ readyState: 3 }); // CLOSED
    const client = createBridgeClient({ WebSocketCtor: FakeWebSocket, port: 43117 });
    client.connect();

    expect(() => client.sendCommand({ type: 'prompt', message: 'test' }))
      .toThrow('Bridge websocket is not connected');
  });

  it('forwards tool_call broadcast to onEvent without sending tool_response', async () => {
    const listeners = {};
    const sent = [];
    class FakeWebSocket {
      constructor() { this.readyState = 1; }
      addEventListener(name, handler) { listeners[name] = handler; }
      send(message) { sent.push(message); }
      close() {}
    }
    const onEvent = vi.fn();
    const client = createBridgeClient({
      WebSocketCtor: FakeWebSocket,
      port: 43117,
      executeTool: async () => ({ result: 'ok' }),
      onEvent,
    });
    client.connect();

    await listeners.message({
      data: JSON.stringify({ type: 'tool_call', name: 'browser_list_tabs', params: {} }),
    });

    // tool_call is a one-way broadcast from bridge for UI display only
    // Chrome extension should NOT send tool_response back
    expect(onEvent).toHaveBeenCalledWith({ type: 'tool_call', name: 'browser_list_tabs', params: {} });
    expect(sent).toEqual([]);
  });

  it('forwards tool_result broadcast to onEvent', async () => {
    const listeners = {};
    const sent = [];
    class FakeWebSocket {
      constructor() { this.readyState = 1; }
      addEventListener(name, handler) { listeners[name] = handler; }
      send(message) { sent.push(message); }
      close() {}
    }
    const onEvent = vi.fn();
    const client = createBridgeClient({
      WebSocketCtor: FakeWebSocket,
      port: 43117,
      onEvent,
    });
    client.connect();

    await listeners.message({
      data: JSON.stringify({ type: 'tool_result', name: 'browser_list_tabs', result: { tabs: [] } }),
    });

    expect(onEvent).toHaveBeenCalledWith({ type: 'tool_result', name: 'browser_list_tabs', result: { tabs: [] } });
    expect(sent).toEqual([]);
  });

  it('sends new_session command with cwd', () => {
    const { FakeWebSocket, sent } = createFakeWebSocket();
    const client = createBridgeClient({ WebSocketCtor: FakeWebSocket, port: 43117 });
    client.connect();

    client.sendCommand({ type: 'new_session', cwd: '/home/user/my-project' });

    expect(sent).toEqual([JSON.stringify({ type: 'new_session', cwd: '/home/user/my-project' })]);
  });
});
