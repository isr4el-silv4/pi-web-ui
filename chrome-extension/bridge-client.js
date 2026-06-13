const MAX_RECONNECT_ATTEMPTS = 7;
const RECONNECT_DELAY_MS = 2000;

export function createBridgeClient({ WebSocketCtor = WebSocket, port = 43117, onEvent = () => {}, executeTool } = {}) {
  let socket;
  let reconnectAttempts = 0;
  let reconnectTimer = null;

  function connect() {
    console.log('[BridgeClient] Connecting to ws://127.0.0.1:' + port);
    socket = new WebSocketCtor(`ws://127.0.0.1:${port}`);
    socket.addEventListener('open', () => {
      console.log('[BridgeClient] Connected!');
      onEvent({ type: 'bridge_connected' });
      // Fetch session state from HTTP /status as a reliable source of truth
      fetch(`http://127.0.0.1:${port}/status`)
        .then((res) => res.json())
        .then((data) => {
          if (data.session) {
            console.log('[BridgeClient] Fetched session state from /status:', data.session);
            onEvent({ type: 'session_state', session: data.session });
          }
        })
        .catch((err) => console.error('[BridgeClient] Failed to fetch /status:', err));
    });
    socket.addEventListener('close', (e) => {
      console.log('[BridgeClient] Disconnected:', e.code, e.reason);
      onEvent({ type: 'bridge_disconnected' });
      scheduleReconnect();
    });
    socket.addEventListener('error', (e) => {
      console.error('[BridgeClient] Error:', e);
      // Suppress bridge_error during reconnection — the close event already
      // fires and scheduleReconnect handles the retry logic.
      if (reconnectAttempts === 0) {
        onEvent({ type: 'bridge_error', error: 'WebSocket connection error' });
      }
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
  }

  function scheduleReconnect() {
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempts++;
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[BridgeClient] Reconnection exhausted after', MAX_RECONNECT_ATTEMPTS, 'attempts');
      onEvent({ type: 'bridge_reconnect_exhausted' });
      return;
    }
    console.log('[BridgeClient] Scheduling reconnection attempt', reconnectAttempts, 'of', MAX_RECONNECT_ATTEMPTS);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY_MS);
  }

  return {
    connect,
    sendCommand(command) {
      console.log('[BridgeClient] Sending command:', command.type, 'socket readyState:', socket?.readyState);
      if (!socket || socket.readyState !== 1) throw new Error('Bridge websocket is not connected');
      socket.send(JSON.stringify(command));
      console.log('[BridgeClient] Command sent successfully');
    },
    disconnect() {
      if (reconnectTimer != null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectAttempts = MAX_RECONNECT_ATTEMPTS + 1; // Prevent any further reconnects
      socket?.close();
    },
  };
}
