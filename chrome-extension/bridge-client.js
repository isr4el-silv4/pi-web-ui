export function createBridgeClient({ WebSocketCtor = WebSocket, port = 43117, onEvent = () => {}, executeTool } = {}) {
  let socket;

  return {
    connect() {
      console.log('[BridgeClient] Connecting to ws://127.0.0.1:' + port);
      socket = new WebSocketCtor(`ws://127.0.0.1:${port}`);
      socket.addEventListener('open', () => {
        console.log('[BridgeClient] Connected!');
        onEvent({ type: 'bridge_connected' });
      });
      socket.addEventListener('close', (e) => {
        console.log('[BridgeClient] Disconnected:', e.code, e.reason);
        onEvent({ type: 'bridge_disconnected' });
      });
      socket.addEventListener('error', (e) => {
        console.error('[BridgeClient] Error:', e);
        onEvent({ type: 'bridge_error', error: 'WebSocket connection error' });
      });
      socket.addEventListener('message', async (event) => {
        try {
          const message = JSON.parse(event.data);
          if (typeof message !== 'object' || message === null || Array.isArray(message)) {
            console.error('[BridgeClient] Received non-object message:', event.data);
            onEvent({ type: 'error', error: 'Invalid bridge message' });
            return;
          }
          console.log('[BridgeClient] Received:', message.type, JSON.stringify(message).substring(0, 200));
          if (message.type === 'browser_tool_request' && executeTool) {
            try {
              const data = await executeTool(message.tool, message.params ?? {});
              socket.send(JSON.stringify({ id: message.id, type: 'browser_tool_response', success: true, data }));
            } catch (error) {
              socket.send(JSON.stringify({ id: message.id, type: 'browser_tool_response', success: false, error: error instanceof Error ? error.message : String(error) }));
            }
            return;
          }
          onEvent(message);
        } catch (err) {
          console.error('[BridgeClient] Parse error:', err);
          onEvent({ type: 'error', error: 'Invalid bridge message' });
        }
      });
      return socket;
    },
    sendCommand(command) {
      console.log('[BridgeClient] Sending command:', command.type, 'socket readyState:', socket?.readyState);
      if (!socket || socket.readyState !== 1) throw new Error('Bridge websocket is not connected');
      socket.send(JSON.stringify(command));
      console.log('[BridgeClient] Command sent successfully');
    },
    disconnect() {
      socket?.close();
    },
  };
}
